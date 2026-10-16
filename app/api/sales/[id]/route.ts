// app/api/sales/[id]/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule, getModulePermissions, nullifyKeysDeep } from "@/lib/auth";
import {
  consumeFifo,
  InsufficientStockError,
  recordSaleItemBatchAllocations,
  restoreSaleItemBatchAllocations,
  supportsSaleItemBatchAllocations,
  type FifoTake,
} from "@/lib/fifo";
import { withTransaction } from "@/lib/db-transaction";

const sql = neon(process.env.DATABASE_URL!);

type Params = { params: Promise<{ id: string }> };

class SaleStateConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaleStateConflictError";
  }
}

// Clave compuesta para identificar un item único (producto + variante)
function itemKey(productId: number, variantId: number | null) {
  return `${productId}-${variantId ?? "null"}`;
}

// ── GET /api/sales/[id] ────────────────────────────────────────────────
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'SALES', 'canView');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const { id }     = await params;
    const saleId     = Number(id);

    if (isNaN(saleId)) return createErrorResponse("ID inválido", 400);

    const [sale] = await sql`
      SELECT
        s.*,
        EXTRACT(EPOCH FROM s.updated_at)::text AS updated_at_version,
        c.name  AS customer_name,
        c.phone AS customer_phone,
        a.name  AS account_name
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN accounts  a ON a.id = s.account_id
      WHERE s.id = ${saleId} AND s.org_id = ${orgId}
    `;

    if (!sale) return createErrorResponse("Venta no encontrada", 404);

    const [neighbors] = await sql`
      WITH ordered AS (
        SELECT
          id,
          LAG(id)  OVER (ORDER BY sold_at DESC, id DESC) AS newer_id,
          LEAD(id) OVER (ORDER BY sold_at DESC, id DESC) AS older_id
        FROM sales
        WHERE org_id = ${orgId}
      )
      SELECT newer_id, older_id FROM ordered WHERE id = ${saleId}
    `;

    const items = await sql`
      SELECT
        si.*,
        p.name       AS product_name,
        p.image_url,
        p.is_service,
        pv.variant_name
      FROM sale_items si
      JOIN  products         p  ON p.id  = si.product_id
      LEFT JOIN product_variants pv ON pv.id = si.variant_id
      WHERE si.sale_id = ${saleId} AND si.org_id = ${orgId}
    `;

    const supplies = await sql`
      SELECT ss.id, ss.supply_id, su.name AS supply_name,
             ss.quantity, ss.unit_cost, ss.line_total
      FROM sale_supplies ss
      JOIN supplies su ON su.id = ss.supply_id
      WHERE ss.sale_id = ${saleId} AND ss.org_id = ${orgId}
    `;

    // ── Ganancia — calculada en el servidor (misma fórmula que el frontend
    // usaba antes) para poder ocultarla vía show_profit sin depender de que
    // el cliente reciba el costo real de cada item.
    const productsCost  = items.reduce((acc, i) => acc + Number(i.unit_cost) * Number(i.quantity), 0);
    const suppliesCost  = supplies.reduce((acc, s) => acc + Number(s.line_total), 0);
    const taxAmount     = Number(sale.tax ?? 0);
    const taxableBase   = Number(sale.subtotal) - Number(sale.discount ?? 0);
    const netBase        = taxableBase - taxAmount;
    const netProfit      = netBase - productsCost - suppliesCost;
    const marginPct      = netBase > 0 ? (netProfit / netBase) * 100 : 0;

    const itemsWithProfit = items.map((i) => {
      const itemCost   = Number(i.unit_cost) * Number(i.quantity);
      const itemProfit = Number(i.line_total) - itemCost;
      const itemMargin = Number(i.line_total) > 0 ? (itemProfit / Number(i.line_total)) * 100 : 0;
      return { ...i, item_profit: itemProfit, item_margin: itemMargin };
    });

    const payload = {
      ...sale,
      items:          itemsWithProfit,
      supplies,
      next_id:        neighbors?.newer_id ?? null,
      prev_id:        neighbors?.older_id ?? null,
      products_cost:  productsCost as number | null,
      supplies_cost:  suppliesCost as number | null,
      net_profit:     netProfit as number | null,
      margin_pct:     marginPct as number | null,
    };

    const perms = await getModulePermissions(auth.data, 'SALES');

    // El costo (unitario y de suministros) solo viaja si el rol tiene
    // show_costs; la ganancia (por item y total) solo si tiene show_profit.
    // Se filtran por separado porque `unit_cost` significa lo mismo en
    // ambos arreglos, pero `line_total` de suministros es costo mientras
    // que el de `items` es venta — no se pueden anular con la misma clave.
    if (!perms.showCosts) {
      nullifyKeysDeep(payload.items, new Set(["unit_cost"]));
      nullifyKeysDeep(payload.supplies, new Set(["unit_cost", "line_total"]));
      payload.products_cost = null;
      payload.supplies_cost = null;
    }
    if (!perms.showProfit) {
      nullifyKeysDeep(payload.items, new Set(["item_profit", "item_margin"]));
      payload.net_profit = null;
      payload.margin_pct = null;
    }

    return Response.json({ data: payload });
  } catch (error) {
    console.error("GET /api/sales/[id]:", error);
    return createErrorResponse("Error al obtener venta", 500);
  }
}

// ── PATCH /api/sales/[id] ──────────────────────────────────────────────
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'SALES', 'canEdit');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const { id }     = await params;
    const saleId     = Number(id);

    if (isNaN(saleId)) return createErrorResponse("ID inválido", 400);

    const body   = await request.json();
    const action = body.action as "confirm" | "cancel" | "edit";
    const reason = typeof body.reason === "string" ? body.reason.trim() || null : null;

    if (!["confirm", "cancel", "edit"].includes(action))
      return createErrorResponse("Acción inválida. Usar: confirm | cancel | edit", 400);

    const [sale] = await sql`
      SELECT * FROM sales WHERE id = ${saleId} AND org_id = ${orgId}
    `;
    if (!sale) return createErrorResponse("Venta no encontrada", 404);
    if (action !== "edit" && sale.status !== "PENDING")
      return createErrorResponse("Solo se pueden confirmar o cancelar ventas pendientes", 400);
    if (action === "edit" && sale.status === "CANCELLED")
      return createErrorResponse("No se puede editar una venta cancelada", 409);

    // ── CONFIRM ──────────────────────────────────────────────────────
    if (action === "confirm") {
      const confirmedAt = body.confirmed_at ?? new Date().toISOString();

      // La transacción siempre referencia la venta puntual (reference_type='SALE',
      // reference_id=saleId), incluso si está ligada a un evento — ver nota en
      // app/api/sales/route.ts sobre por qué esto es seguro para los reportes de eventos.
      try {
        return await withTransaction(async (tx) => {
        const [lockedSale] = await tx`
          SELECT * FROM sales
          WHERE id = ${saleId} AND org_id = ${orgId}
          FOR UPDATE
        `;
        if (!lockedSale || lockedSale.status !== "PENDING") {
          throw new SaleStateConflictError(
            "La venta ya fue confirmada o cancelada",
          );
        }

        const txParts: string[] = [`Venta ${lockedSale.sale_number}`];
        if (Number(lockedSale.tax_rate) > 0)
          txParts.push(`ISV ${lockedSale.tax_rate}% incluido`);
        if (Number(lockedSale.shipping_cost) > 0)
          txParts.push(
            `envío L ${Number(lockedSale.shipping_cost).toFixed(2)}`,
          );
        const txDescription =
          txParts.length > 1
            ? `${txParts[0]} (${txParts.slice(1).join(", ")})`
            : txParts[0];

        await tx`
          UPDATE sales SET status = 'COMPLETED', sold_at = ${confirmedAt}, updated_at = CURRENT_TIMESTAMP, updated_by = ${userId}
          WHERE id = ${saleId} AND org_id = ${orgId} AND status = 'PENDING'
        `;
        await tx`
          INSERT INTO transactions (
            org_id, created_by, type, account_id, amount,
            category, description, reference_type, reference_id, occurred_at
          ) VALUES (
            ${orgId}, ${userId}, 'INCOME', ${lockedSale.account_id}, ${lockedSale.total},
            'Ventas', ${txDescription}, 'SALE', ${saleId}, ${confirmedAt}
          )
        `;
        await tx`
          UPDATE accounts SET balance = balance + ${lockedSale.total}, updated_by = ${userId}
          WHERE id = ${lockedSale.account_id} AND org_id = ${orgId}
        `;
        if (lockedSale.customer_id) {
          await tx`
            UPDATE customers
            SET total_orders = total_orders + 1,
                total_spent  = total_spent  + ${lockedSale.total},
                updated_at   = CURRENT_TIMESTAMP,
                updated_by   = ${userId}
            WHERE id = ${lockedSale.customer_id} AND org_id = ${orgId}
          `;
        }
        return Response.json({
          message: "Venta confirmada",
          data: { id: saleId, status: "COMPLETED" },
        });
        });
      } catch (e) {
        if (e instanceof SaleStateConflictError) {
          return createErrorResponse(e.message, 409);
        }
        throw e;
      }
    }

    // ── CANCEL ───────────────────────────────────────────────────────
    if (action === "cancel") {
      try {
        return await withTransaction(async (tx) => {
        const [lockedSale] = await tx`
          SELECT * FROM sales
          WHERE id = ${saleId} AND org_id = ${orgId}
          FOR UPDATE
        `;
        if (!lockedSale || lockedSale.status !== "PENDING") {
          throw new SaleStateConflictError(
            "La venta ya fue confirmada o cancelada",
          );
        }

        const allocationsSupported =
          await supportsSaleItemBatchAllocations(tx);
        const items = await tx`
          SELECT si.id, si.product_id, si.variant_id, si.quantity, p.is_service
          FROM sale_items si
          JOIN products p ON p.id = si.product_id
          WHERE si.sale_id = ${saleId} AND si.org_id = ${orgId}
        `;

        for (const item of items) {
          if (item.is_service) continue;

          const variantId = item.variant_id ? Number(item.variant_id) : null;
          const restoredFromAllocations = allocationsSupported
            ? await restoreSaleItemBatchAllocations(
                tx,
                orgId,
                Number(item.id),
                userId,
              )
            : 0;
          const legacyQuantity = Math.max(
            0,
            Number(item.quantity) - restoredFromAllocations,
          );

          const [lastBatch] = legacyQuantity > 0
            ? variantId !== null
            ? await tx`
                SELECT id FROM inventory_batches
                WHERE org_id       = ${orgId}
                  AND product_id   = ${item.product_id}
                  AND variant_id   = ${variantId}
                  AND warehouse_id = ${lockedSale.warehouse_id}
                ORDER BY received_at ASC LIMIT 1
              `
            : await tx`
                SELECT id FROM inventory_batches
                WHERE org_id       = ${orgId}
                  AND product_id   = ${item.product_id}
                  AND variant_id IS NULL
                  AND warehouse_id = ${lockedSale.warehouse_id}
                ORDER BY received_at ASC LIMIT 1
              `
            : [];

          if (lastBatch) {
            await tx`
              UPDATE inventory_batches
              SET qty_available = qty_available + ${legacyQuantity}, updated_by = ${userId}
              WHERE id = ${lastBatch.id} AND org_id = ${orgId}
            `;
          }

          await tx`
            INSERT INTO inventory_movements (
              org_id, created_by, movement_type, product_id, variant_id,
              quantity, reference_type, reference_id, warehouse_id
            ) VALUES (
              ${orgId}, ${userId}, 'IN', ${item.product_id}, ${variantId},
              ${item.quantity}, 'SALE_CANCELLED', ${saleId}, ${lockedSale.warehouse_id}
            )
          `;
        }

        const supplies = await tx`
          SELECT supply_id, quantity FROM sale_supplies
          WHERE sale_id = ${saleId} AND org_id = ${orgId}
        `;
        for (const s of supplies) {
          const supplyQty = Math.round(Number(s.quantity));
          await tx`
            UPDATE supplies SET stock = stock + ${supplyQty}, updated_by = ${userId}
            WHERE id = ${s.supply_id} AND org_id = ${orgId}
          `;
          await tx`
            INSERT INTO supply_movements (
              org_id, created_by, movement_type, supply_id,
              quantity, reference_type, reference_id
            ) VALUES (
              ${orgId}, ${userId}, 'IN', ${s.supply_id},
              ${supplyQty}, 'SALE_CANCELLED', ${saleId}
            )
          `;
        }

        // Soft-delete: se marcan como canceladas en vez de borrarse, para
        // conservar trazabilidad (quién, cuándo, por qué).
        await tx`UPDATE sale_supplies SET deleted_at = NOW(), updated_by = ${userId} WHERE sale_id = ${saleId} AND org_id = ${orgId}`;
        await tx`UPDATE sale_items    SET deleted_at = NOW(), updated_by = ${userId} WHERE sale_id = ${saleId} AND org_id = ${orgId}`;
        await tx`
          UPDATE sales SET
            status               = 'CANCELLED',
            deleted_at           = NOW(),
            deleted_by           = ${userId},
            cancellation_reason  = ${reason},
            updated_at           = CURRENT_TIMESTAMP,
            updated_by           = ${userId}
          WHERE id = ${saleId} AND org_id = ${orgId} AND status = 'PENDING'
        `;

        return Response.json({ message: "Venta cancelada y stock devuelto", data: { id: saleId, status: "CANCELLED" } });
        });
      } catch (e) {
        if (e instanceof SaleStateConflictError) {
          return createErrorResponse(e.message, 409);
        }
        throw e;
      }
    }

    // ── EDIT ─────────────────────────────────────────────────────────
    if (action === "edit") {
      const {
        items: newItems,
        discount,
        shipping_cost,
        tax_rate,
        notes,
        customer_id,
        account_id,
        supplies_used,
        expected_updated_at_version,
      } = body;

      if (!newItems || !Array.isArray(newItems) || newItems.length === 0)
        return createErrorResponse("Se requiere al menos un producto", 400);

      const taxRateNum = Number(tax_rate ?? sale.tax_rate) || 0;
      if (![0, 15, 18].includes(taxRateNum))
        return createErrorResponse("El porcentaje de impuesto debe ser 0, 15 o 18", 400);

      const finalAccountId = account_id !== undefined
        ? Number(account_id)
        : Number(sale.account_id);
      const finalCustomerId = customer_id !== undefined
        ? (customer_id === null ? null : Number(customer_id))
        : (sale.customer_id ? Number(sale.customer_id) : null);

      // Toda venta editable conserva una cuenta válida; si ya está completada,
      // esta será también la cuenta cuyo saldo se corrige.
      if (!finalAccountId)
        return createErrorResponse("Selecciona una cuenta de destino", 400);
      if (finalAccountId !== Number(sale.account_id)) {
        const [acc] = await sql`
          SELECT id FROM accounts
          WHERE id = ${finalAccountId} AND org_id = ${orgId} AND is_active = TRUE
        `;
        if (!acc) return createErrorResponse("Cuenta de destino no encontrada", 404);
      }

      // Traer items actuales — clave compuesta producto+variante
      const currentItems = await sql`
        SELECT si.id, si.product_id, si.variant_id, si.quantity, si.unit_cost, p.is_service
        FROM sale_items si
        JOIN products p ON p.id = si.product_id
        WHERE si.sale_id = ${saleId} AND si.org_id = ${orgId}
      `;

      type CurrentItem = {
        id:         number;
        quantity:   number;
        unit_cost:  number;
        is_service: boolean;
        variant_id: number | null;
      };
      const currentMap = new Map<string, CurrentItem>();
      for (const i of currentItems) {
        const vid = i.variant_id ? Number(i.variant_id) : null;
        currentMap.set(itemKey(Number(i.product_id), vid), {
          id:         Number(i.id),
          quantity:   Number(i.quantity),
          unit_cost:  Number(i.unit_cost),
          is_service: Boolean(i.is_service),
          variant_id: vid,
        });
      }

      type NewItem = {
        product_id: number;
        variant_id: number | null;
        quantity:   number;
        unit_price: number;
        discount:   number;
      };
      const newMap = new Map<string, NewItem>();
      for (const i of newItems) {
        const vid = i.variant_id ? Number(i.variant_id) : null;
        newMap.set(itemKey(Number(i.product_id), vid), {
          product_id: Number(i.product_id),
          variant_id: vid,
          quantity:   Number(i.quantity),
          unit_price: Number(i.unit_price),
          discount:   Number(i.discount ?? 0),
        });
      }

      // Validar stock para aumentos de cantidad en productos físicos
      for (const [key, newData] of newMap.entries()) {
        const current    = currentMap.get(key);
        const currentQty = current?.quantity ?? 0;
        const isService  = current?.is_service ?? false;
        const delta      = newData.quantity - currentQty;

        if (delta <= 0) continue;

        // Verificar si es servicio (puede ser un producto nuevo en el edit)
        const [product] = await sql`
          SELECT name, is_service FROM products
          WHERE id = ${newData.product_id} AND org_id = ${orgId}
        `;
        if (!product || product.is_service || isService) continue;

        // Verificar variante si aplica
        let variantName: string | null = null;
        if (newData.variant_id !== null) {
          const [variant] = await sql`
            SELECT id, variant_name FROM product_variants
            WHERE id         = ${newData.variant_id}
              AND product_id = ${newData.product_id}
              AND org_id     = ${orgId}
              AND is_active  = TRUE
          `;
          if (!variant)
            return createErrorResponse(
              `Variante #${newData.variant_id} no válida para "${product.name}"`, 404
            );
          variantName = variant.variant_name;
        }

        const [batchesSum] = newData.variant_id !== null
          ? await sql`
              SELECT COALESCE(SUM(qty_available), 0)::numeric AS available
              FROM inventory_batches
              WHERE org_id       = ${orgId}
                AND product_id   = ${newData.product_id}
                AND variant_id   = ${newData.variant_id}
                AND warehouse_id = ${sale.warehouse_id}
            `
          : await sql`
              SELECT COALESCE(SUM(qty_available), 0)::numeric AS available
              FROM inventory_batches
              WHERE org_id       = ${orgId}
                AND product_id   = ${newData.product_id}
                AND variant_id IS NULL
                AND warehouse_id = ${sale.warehouse_id}
            `;

        const available = Number(batchesSum?.available ?? 0);
        const label = newData.variant_id !== null
          ? `${product.name} (${variantName ?? `variante #${newData.variant_id}`})`
          : product.name;

        if (available < delta) {
          return createErrorResponse(
            `Stock insuficiente para "${label}". Disponible: ${available}`,
            400
          );
        }
      }

      // Recalcular costos FIFO por variante
      const processedItems: any[] = [];

      for (const [key, data] of newMap.entries()) {
        const current    = currentMap.get(key);
        const currentQty = current?.quantity ?? 0;
        const delta      = data.quantity - currentQty;

        const [product] = await sql`
          SELECT is_service, service_cost FROM products
          WHERE id = ${data.product_id} AND org_id = ${orgId}
        `;
        const isService = Boolean(product?.is_service);

        let unitCost = 0;

        if (isService) {
          // Sin cambio de cantidad → conservar costo original de la línea;
          // si cambia o es nueva, usar el costo de servicio configurado hoy.
          unitCost = (delta === 0 && current) ? current.unit_cost : (Number(product?.service_cost) || 0);
        } else {
          if (delta === 0 && current) {
            // Sin cambio de cantidad → conservar costo original
            unitCost = current.unit_cost;
          } else {
            // Con cambio → recalcular FIFO completo por variante
            const batches = data.variant_id !== null
              ? await sql`
                  SELECT id, qty_available, unit_cost
                  FROM inventory_batches
                  WHERE org_id       = ${orgId}
                    AND product_id   = ${data.product_id}
                    AND variant_id   = ${data.variant_id}
                    AND warehouse_id = ${sale.warehouse_id}
                    AND qty_available > 0
                  ORDER BY received_at ASC
                `
              : await sql`
                  SELECT id, qty_available, unit_cost
                  FROM inventory_batches
                  WHERE org_id       = ${orgId}
                    AND product_id   = ${data.product_id}
                    AND variant_id IS NULL
                    AND warehouse_id = ${sale.warehouse_id}
                    AND qty_available > 0
                  ORDER BY received_at ASC
                `;

            let remaining = data.quantity;
            let totalCost = 0;
            for (const batch of batches) {
              if (remaining <= 0) break;
              const take  = Math.min(remaining, Number(batch.qty_available));
              totalCost  += take * Number(batch.unit_cost);
              remaining  -= take;
            }
            unitCost = data.quantity > 0 ? totalCost / data.quantity : 0;
          }
        }

        processedItems.push({
          product_id: data.product_id,
          variant_id: data.variant_id,
          quantity:   data.quantity,
          unit_price: data.unit_price,
          unit_cost: unitCost,
          discount: data.discount,
          line_total: data.unit_price * data.quantity - data.discount,
          delta,
          isService,
        });
      }

      const newSubtotal = processedItems.reduce((acc, i) => acc + i.unit_price * i.quantity, 0);
      const globalDiscount = Number(discount ?? sale.discount) || 0;
      const itemDiscounts  = processedItems.reduce((acc, i) => acc + i.discount, 0);
      const totalDiscount  = globalDiscount + itemDiscounts;
      const shippingAmount = (shipping_cost !== undefined && shipping_cost !== null)
        ? Number(shipping_cost)
        : Number(sale.shipping_cost);
      const taxableBase    = newSubtotal - totalDiscount;
      const taxAmount      = taxRateNum > 0 ? taxableBase * taxRateNum / (100 + taxRateNum) : 0;
      const grandTotal     = taxableBase + shippingAmount;
      // Validar y normalizar suministros nuevos (si se envían)
      type NormalizedSupply = { supply_id: number; quantity: number; unit_cost: number; line_total: number };
      const normalizedNewSupplies: NormalizedSupply[] = [];
      if (Array.isArray(supplies_used) && supplies_used.length > 0) {
        for (const s of supplies_used) {
          const supply_id = Number(s.supply_id);
          const quantity  = Number(s.quantity);
          const unit_cost = Number(s.unit_cost);
          if (!supply_id || quantity <= 0)
            return createErrorResponse("Datos de suministro inválidos", 400);
          const [supply] = await sql`
            SELECT id FROM supplies WHERE id = ${supply_id} AND org_id = ${orgId}
          `;
          if (!supply)
            return createErrorResponse(`Suministro #${supply_id} no encontrado`, 404);
          normalizedNewSupplies.push({ supply_id, quantity, unit_cost, line_total: quantity * unit_cost });
        }
      }

      // Suministros actuales de la venta (para calcular deltas)
      const currentSupplies = Array.isArray(supplies_used)
        ? await sql`
            SELECT supply_id, quantity FROM sale_supplies
            WHERE sale_id = ${saleId} AND org_id = ${orgId}
          `
        : [];

      try {
        return await withTransaction(async (tx) => {
        const [lockedSale] = await tx`
          SELECT
            status,
            -- Epoch representa el instante de forma idéntica aunque la
            -- conexión HTTP use UTC y la transacción use America/Tegucigalpa.
            EXTRACT(EPOCH FROM updated_at)::text AS updated_at_version
          FROM sales
          WHERE id = ${saleId} AND org_id = ${orgId}
          FOR UPDATE
        `;
        if (!lockedSale || lockedSale.status === "CANCELLED") {
          throw new SaleStateConflictError(
            "La venta fue cancelada y ya no se puede editar",
          );
        }
        // La versión debe venir del GET que abrió el formulario, no de otra
        // lectura al comienzo de este PATCH. Así detectamos únicamente una
        // edición real posterior. Se omite para clientes antiguos que todavía
        // no envían la versión, evitando bloquearlos con un falso conflicto.
        if (
          expected_updated_at_version !== undefined &&
          lockedSale.updated_at_version !== expected_updated_at_version
        ) {
          console.warn("Conflicto de versión al editar venta", {
            saleId,
            expectedVersion: expected_updated_at_version,
            currentVersion: lockedSale.updated_at_version,
            expectedType: typeof expected_updated_at_version,
            currentType: typeof lockedSale.updated_at_version,
          });
          throw new SaleStateConflictError(
            "La venta cambió mientras se estaba editando. Recarga e inténtalo de nuevo",
          );
        }

        const allocationsSupported =
          await supportsSaleItemBatchAllocations(tx);
        const fifoTakesByKey = new Map<string, FifoTake[]>();

        if (allocationsSupported) {
          // Primero se devuelve cada reserva a sus lotes exactos. Después se
          // consume de nuevo la venta completa, de modo que el costo unitario
          // siempre corresponde al FIFO vigente y no a una mezcla estimada.
          for (const [key, current] of currentMap.entries()) {
            if (current.is_service) continue;

            const restored = await restoreSaleItemBatchAllocations(
              tx,
              orgId,
              current.id,
              userId,
            );
            const legacyQuantity = Math.max(0, current.quantity - restored);
            if (legacyQuantity === 0) continue;

            const [productIdStr, variantIdStr] = key.split("-");
            const productId = Number(productIdStr);
            const variantId =
              variantIdStr === "null" ? null : Number(variantIdStr);
            const [legacyBatch] =
              variantId !== null
                ? await tx`
                    SELECT id FROM inventory_batches
                    WHERE org_id       = ${orgId}
                      AND product_id   = ${productId}
                      AND variant_id   = ${variantId}
                      AND warehouse_id = ${sale.warehouse_id}
                    ORDER BY received_at ASC LIMIT 1
                  `
                : await tx`
                    SELECT id FROM inventory_batches
                    WHERE org_id       = ${orgId}
                      AND product_id   = ${productId}
                      AND variant_id IS NULL
                      AND warehouse_id = ${sale.warehouse_id}
                    ORDER BY received_at ASC LIMIT 1
                  `;
            if (legacyBatch) {
              await tx`
                UPDATE inventory_batches
                SET qty_available = qty_available + ${legacyQuantity},
                    updated_by = ${userId}
                WHERE id = ${legacyBatch.id} AND org_id = ${orgId}
              `;
            }
          }

          for (const item of processedItems) {
            if (item.isService) continue;
            const consumed = await consumeFifo(
              tx,
              orgId,
              item.product_id,
              item.variant_id,
              item.quantity,
              userId,
              sale.warehouse_id,
            );
            if (!consumed) {
              throw new InsufficientStockError(
                `Producto #${item.product_id}`,
              );
            }
            item.unit_cost = consumed.totalCost / item.quantity;
            fifoTakesByKey.set(
              itemKey(item.product_id, item.variant_id),
              consumed.takes,
            );
          }
        } else {
          // Compatibilidad para instalaciones que todavía no aplicaron v4.26
          // y para ventas históricas sin asignaciones de lote.
          for (const item of processedItems) {
            if (item.isService) continue;
            const current = currentMap.get(
              itemKey(item.product_id, item.variant_id),
            );
            if (item.delta > 0) {
              const consumed = await consumeFifo(
                tx,
                orgId,
                item.product_id,
                item.variant_id,
                item.delta,
                userId,
                sale.warehouse_id,
              );
              if (!consumed) {
                throw new InsufficientStockError(
                  `Producto #${item.product_id}`,
                );
              }
              const previousCost = current
                ? current.unit_cost * current.quantity
                : 0;
              item.unit_cost =
                (previousCost + consumed.totalCost) / item.quantity;
            } else if (item.delta < 0) {
              const [lastBatch] =
                item.variant_id !== null
                  ? await tx`
                      SELECT id FROM inventory_batches
                      WHERE org_id       = ${orgId}
                        AND product_id   = ${item.product_id}
                        AND variant_id   = ${item.variant_id}
                        AND warehouse_id = ${sale.warehouse_id}
                      ORDER BY received_at ASC LIMIT 1
                    `
                  : await tx`
                      SELECT id FROM inventory_batches
                      WHERE org_id       = ${orgId}
                        AND product_id   = ${item.product_id}
                        AND variant_id IS NULL
                        AND warehouse_id = ${sale.warehouse_id}
                      ORDER BY received_at ASC LIMIT 1
                    `;
              if (lastBatch) {
                await tx`
                  UPDATE inventory_batches
                  SET qty_available = qty_available + ${Math.abs(item.delta)},
                      updated_by = ${userId}
                  WHERE id = ${lastBatch.id} AND org_id = ${orgId}
                `;
              }
              if (current) item.unit_cost = current.unit_cost;
            }
          }

          for (const [key, current] of currentMap.entries()) {
            if (newMap.has(key) || current.is_service) continue;
            const [productIdStr, variantIdStr] = key.split("-");
            const productId = Number(productIdStr);
            const variantId =
              variantIdStr === "null" ? null : Number(variantIdStr);
            const [lastBatch] =
              variantId !== null
                ? await tx`
                    SELECT id FROM inventory_batches
                    WHERE org_id       = ${orgId}
                      AND product_id   = ${productId}
                      AND variant_id   = ${variantId}
                      AND warehouse_id = ${sale.warehouse_id}
                    ORDER BY received_at ASC LIMIT 1
                  `
                : await tx`
                    SELECT id FROM inventory_batches
                    WHERE org_id       = ${orgId}
                      AND product_id   = ${productId}
                      AND variant_id IS NULL
                      AND warehouse_id = ${sale.warehouse_id}
                    ORDER BY received_at ASC LIMIT 1
                  `;
            if (lastBatch) {
              await tx`
                UPDATE inventory_batches
                SET qty_available = qty_available + ${current.quantity},
                    updated_by = ${userId}
                WHERE id = ${lastBatch.id} AND org_id = ${orgId}
              `;
            }
          }
        }

        // Los movimientos son un libro inmutable: la edición agrega solo el
        // delta y nunca reescribe ni elimina el movimiento SALE original.
        const processedByKey = new Map(
          processedItems.map((item) => [
            itemKey(item.product_id, item.variant_id),
            item,
          ]),
        );
        const movementKeys = new Set([
          ...currentMap.keys(),
          ...processedByKey.keys(),
        ]);
        for (const key of movementKeys) {
          const current = currentMap.get(key);
          const next = processedByKey.get(key);
          if (current?.is_service || next?.isService) continue;
          const delta = (next?.quantity ?? 0) - (current?.quantity ?? 0);
          if (delta === 0) continue;

          const [productIdStr, variantIdStr] = key.split("-");
          const productId = next?.product_id ?? Number(productIdStr);
          const variantId =
            next?.variant_id ??
            (variantIdStr === "null" ? null : Number(variantIdStr));
          await tx`
            INSERT INTO inventory_movements (
              org_id, created_by, movement_type, product_id, variant_id,
              quantity, reference_type, reference_id, warehouse_id
            ) VALUES (
              ${orgId}, ${userId}, ${delta > 0 ? "OUT" : "IN"},
              ${productId}, ${variantId}, ${Math.abs(delta)},
              'SALE_EDITED', ${saleId}, ${sale.warehouse_id}
            )
          `;
        }

        // Reemplazar sale_items
        await tx`DELETE FROM sale_items WHERE sale_id = ${saleId} AND org_id = ${orgId}`;
        for (const item of processedItems) {
          const [saleItem] = await tx`
            INSERT INTO sale_items (
              org_id, created_by, sale_id, product_id, variant_id,
              quantity, unit_price, unit_cost, line_total
            ) VALUES (
              ${orgId}, ${userId}, ${saleId},
              ${item.product_id}, ${item.variant_id},
              ${item.quantity}, ${item.unit_price},
              ${item.unit_cost}, ${item.line_total}
            )
            RETURNING id
          `;
          if (allocationsSupported && !item.isService) {
            await recordSaleItemBatchAllocations(
              tx,
              orgId,
              saleId,
              Number(saleItem.id),
              fifoTakesByKey.get(
                itemKey(item.product_id, item.variant_id),
              ) ?? [],
              userId,
            );
          }
        }

        // Actualizar cabecera — ahora incluye account_id
        await tx`
          UPDATE sales SET
            customer_id   = ${finalCustomerId},
            account_id    = ${finalAccountId},
            subtotal      = ${newSubtotal},
            discount      = ${totalDiscount},
            tax_rate      = ${taxRateNum},
            tax           = ${taxAmount},
            shipping_cost = ${shippingAmount},
            total         = ${grandTotal},
            notes         = ${notes         ?? sale.notes},
            updated_at    = CURRENT_TIMESTAMP,
            updated_by    = ${userId}
          WHERE id = ${saleId} AND org_id = ${orgId}
        `;

        // Una venta completada ya impactó caja y estadísticas del cliente.
        // La edición corrige esos acumulados en la misma transacción que el
        // inventario, para que nunca queden cifras parcialmente actualizadas.
        if (lockedSale.status === "COMPLETED") {
          const [financialTx] = await tx`
            SELECT id, account_id, amount
            FROM transactions
            WHERE org_id = ${orgId}
              AND reference_type = 'SALE'
              AND reference_id = ${saleId}
            FOR UPDATE
          `;
          if (!financialTx) {
            throw new SaleStateConflictError(
              "La venta no tiene una transacción financiera vinculada; corrígela antes de editar",
            );
          }

          const oldAccountId = Number(financialTx.account_id);
          const oldFinancialAmount = Number(financialTx.amount);
          if (oldAccountId === finalAccountId) {
            await tx`
              UPDATE accounts
              SET balance = balance + ${grandTotal - oldFinancialAmount},
                  updated_by = ${userId}
              WHERE id = ${finalAccountId} AND org_id = ${orgId}
            `;
          } else {
            await tx`
              UPDATE accounts
              SET balance = balance - ${oldFinancialAmount}, updated_by = ${userId}
              WHERE id = ${oldAccountId} AND org_id = ${orgId}
            `;
            await tx`
              UPDATE accounts
              SET balance = balance + ${grandTotal}, updated_by = ${userId}
              WHERE id = ${finalAccountId} AND org_id = ${orgId}
            `;
          }

          const descriptionParts = [`Venta ${sale.sale_number}`];
          if (taxRateNum > 0) descriptionParts.push(`ISV ${taxRateNum}% incluido`);
          if (shippingAmount > 0)
            descriptionParts.push(`envío L ${shippingAmount.toFixed(2)}`);
          const financialDescription = descriptionParts.length > 1
            ? `${descriptionParts[0]} (${descriptionParts.slice(1).join(", ")})`
            : descriptionParts[0];
          await tx`
            UPDATE transactions
            SET account_id = ${finalAccountId}, amount = ${grandTotal},
                description = ${financialDescription}, updated_by = ${userId}
            WHERE id = ${financialTx.id} AND org_id = ${orgId}
          `;

          const oldCustomerId = sale.customer_id ? Number(sale.customer_id) : null;
          const oldTotal = Number(sale.total);
          if (oldCustomerId && oldCustomerId === finalCustomerId) {
            await tx`
              UPDATE customers
              SET total_spent = GREATEST(0, total_spent + ${grandTotal - oldTotal}),
                  updated_at = CURRENT_TIMESTAMP, updated_by = ${userId}
              WHERE id = ${oldCustomerId} AND org_id = ${orgId}
            `;
          } else {
            if (oldCustomerId) {
              await tx`
                UPDATE customers
                SET total_orders = GREATEST(0, total_orders - 1),
                    total_spent = GREATEST(0, total_spent - ${oldTotal}),
                    updated_at = CURRENT_TIMESTAMP, updated_by = ${userId}
                WHERE id = ${oldCustomerId} AND org_id = ${orgId}
              `;
            }
            if (finalCustomerId) {
              await tx`
                UPDATE customers
                SET total_orders = total_orders + 1,
                    total_spent = total_spent + ${grandTotal},
                    updated_at = CURRENT_TIMESTAMP, updated_by = ${userId}
                WHERE id = ${finalCustomerId} AND org_id = ${orgId}
              `;
            }
          }
        }

        // Ajustar suministros solo si se enviaron en el body
        if (Array.isArray(supplies_used)) {
          const currentSupplyMap = new Map<number, number>();
          for (const s of currentSupplies) {
            currentSupplyMap.set(Number(s.supply_id), Number(s.quantity));
          }
          const newSupplyMap = new Map<number, NormalizedSupply>();
          for (const s of normalizedNewSupplies) {
            newSupplyMap.set(s.supply_id, s);
          }

          // Añadidos o con cantidad modificada
          for (const [supplyId, newData] of newSupplyMap.entries()) {
            const currentQty = currentSupplyMap.get(supplyId) ?? 0;
            const delta = newData.quantity - currentQty;
            if (delta > 0) {
              await tx`
                UPDATE supplies SET stock = GREATEST(0, stock - ${delta}), updated_by = ${userId}
                WHERE id = ${supplyId} AND org_id = ${orgId}
              `;
              await tx`
                INSERT INTO supply_movements (org_id, created_by, movement_type, supply_id, quantity, reference_type, reference_id)
                VALUES (${orgId}, ${userId}, 'OUT', ${supplyId}, ${delta}, 'SALE_EDITED', ${saleId})
              `;
            } else if (delta < 0) {
              await tx`
                UPDATE supplies SET stock = stock + ${Math.abs(delta)}, updated_by = ${userId}
                WHERE id = ${supplyId} AND org_id = ${orgId}
              `;
              await tx`
                INSERT INTO supply_movements (org_id, created_by, movement_type, supply_id, quantity, reference_type, reference_id)
                VALUES (${orgId}, ${userId}, 'IN', ${supplyId}, ${Math.abs(delta)}, 'SALE_EDITED', ${saleId})
              `;
            }
          }

          // Eliminados del carrito
          for (const [supplyId, currentQty] of currentSupplyMap.entries()) {
            if (!newSupplyMap.has(supplyId)) {
              await tx`
                UPDATE supplies SET stock = stock + ${currentQty}, updated_by = ${userId}
                WHERE id = ${supplyId} AND org_id = ${orgId}
              `;
              await tx`
                INSERT INTO supply_movements (org_id, created_by, movement_type, supply_id, quantity, reference_type, reference_id)
                VALUES (${orgId}, ${userId}, 'IN', ${supplyId}, ${currentQty}, 'SALE_EDITED', ${saleId})
              `;
            }
          }

          // Reemplazar sale_supplies
          await tx`DELETE FROM sale_supplies WHERE sale_id = ${saleId} AND org_id = ${orgId}`;
          for (const s of normalizedNewSupplies) {
            await tx`
              INSERT INTO sale_supplies (org_id, created_by, sale_id, supply_id, quantity, unit_cost, line_total)
              VALUES (${orgId}, ${userId}, ${saleId}, ${s.supply_id}, ${s.quantity}, ${s.unit_cost}, ${s.line_total})
            `;
          }
        }

        return Response.json({
          message: "Venta actualizada",
          data: {
            id:            saleId,
            status:        lockedSale.status,
            subtotal:      newSubtotal,
            discount:      totalDiscount,
            tax_rate:      taxRateNum,
            tax:           taxAmount,
            shipping_cost: shippingAmount,
            total:         grandTotal,
            account_id:    finalAccountId,
          },
        });
        });
      } catch (e) {
        if (e instanceof SaleStateConflictError) {
          return createErrorResponse(e.message, 409);
        }
        if (e instanceof InsufficientStockError) {
          return createErrorResponse(
            `${e.message}. Otra venta pudo haber consumido el stock al mismo tiempo`,
            409,
          );
        }
        throw e;
      }
    }

  } catch (error) {
    console.error("PATCH /api/sales/[id]:", error);
    return createErrorResponse("Error al procesar la acción", 500);
  }
}

// ── DELETE /api/sales/[id] ─────────────────────────────────────────────
export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'SALES', 'canDelete');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const { id }     = await params;
    const saleId     = Number(id);

    if (isNaN(saleId)) return createErrorResponse("ID inválido", 400);

    // Body opcional — algunos clientes hacen DELETE sin cuerpo.
    const body = await request.json().catch(() => ({} as any));
    const reason = typeof body?.reason === "string" ? body.reason.trim() || null : null;

    const [sale] = await sql`
      SELECT * FROM sales WHERE id = ${saleId} AND org_id = ${orgId}
    `;
    if (!sale) return createErrorResponse("Venta no encontrada", 404);
    if (sale.status === "CANCELLED")
      return createErrorResponse("Esta venta ya fue cancelada", 400);

    try {
      return await withTransaction(async (tx) => {
      const [lockedSale] = await tx`
        SELECT * FROM sales
        WHERE id = ${saleId} AND org_id = ${orgId}
        FOR UPDATE
      `;
      if (!lockedSale || lockedSale.status === "CANCELLED") {
        throw new SaleStateConflictError("Esta venta ya fue cancelada");
      }

      const allocationsSupported =
        await supportsSaleItemBatchAllocations(tx);
      const items = await tx`
        SELECT si.id, si.product_id, si.variant_id, si.quantity, p.is_service
        FROM sale_items si
        JOIN products p ON p.id = si.product_id
        WHERE si.sale_id = ${saleId} AND si.org_id = ${orgId}
      `;

      const supplies = await tx`
        SELECT supply_id, quantity FROM sale_supplies
        WHERE sale_id = ${saleId} AND org_id = ${orgId}
      `;

      for (const item of items) {
        if (item.is_service) continue;

        const variantId = item.variant_id ? Number(item.variant_id) : null;
        const restoredFromAllocations = allocationsSupported
          ? await restoreSaleItemBatchAllocations(
              tx,
              orgId,
              Number(item.id),
              userId,
            )
          : 0;
        const legacyQuantity = Math.max(
          0,
          Number(item.quantity) - restoredFromAllocations,
        );

        const [lastBatch] = legacyQuantity > 0
          ? variantId !== null
          ? await tx`
              SELECT id FROM inventory_batches
              WHERE org_id       = ${orgId}
                AND product_id   = ${item.product_id}
                AND variant_id   = ${variantId}
                AND warehouse_id = ${lockedSale.warehouse_id}
              ORDER BY received_at ASC LIMIT 1
            `
          : await tx`
              SELECT id FROM inventory_batches
              WHERE org_id       = ${orgId}
                AND product_id   = ${item.product_id}
                AND variant_id IS NULL
                AND warehouse_id = ${lockedSale.warehouse_id}
              ORDER BY received_at ASC LIMIT 1
            `
          : [];

        if (lastBatch) {
          await tx`
            UPDATE inventory_batches
            SET qty_available = qty_available + ${legacyQuantity}, updated_by = ${userId}
            WHERE id = ${lastBatch.id} AND org_id = ${orgId}
          `;
        }

        await tx`
          INSERT INTO inventory_movements (
            org_id, created_by, movement_type, product_id, variant_id,
            quantity, reference_type, reference_id, warehouse_id
          ) VALUES (
            ${orgId}, ${userId}, 'IN', ${item.product_id}, ${variantId},
            ${item.quantity}, 'SALE_CANCELLED', ${saleId}, ${lockedSale.warehouse_id}
          )
        `;
      }

      // 2. Devolver stock de insumos
      for (const s of supplies) {
        const supplyQty = Math.round(Number(s.quantity));
        await tx`
          UPDATE supplies SET stock = stock + ${supplyQty}, updated_by = ${userId}
          WHERE id = ${s.supply_id} AND org_id = ${orgId}
        `;
        await tx`
          INSERT INTO supply_movements (
            org_id, created_by, movement_type, supply_id,
            quantity, reference_type, reference_id
          ) VALUES (
            ${orgId}, ${userId}, 'IN', ${s.supply_id},
            ${supplyQty}, 'SALE_CANCELLED', ${saleId}
          )
        `;
      }

      // 3. Si estaba COMPLETED: revertir transacción y balance
      if (lockedSale.status === "COMPLETED") {
        const [linkedTx] = await tx`
          SELECT id, amount FROM transactions
          WHERE org_id         = ${orgId}
            AND reference_type = 'SALE'
            AND reference_id   = ${saleId}
            AND deleted_at     IS NULL
        `;
        if (linkedTx) {
          await tx`
            UPDATE transactions
            SET deleted_at = NOW(), deleted_by = ${userId}, updated_by = ${userId}
            WHERE id = ${linkedTx.id} AND org_id = ${orgId}
          `;
          await tx`
            UPDATE accounts
            SET balance = balance - ${linkedTx.amount}, updated_by = ${userId}
            WHERE id = ${lockedSale.account_id} AND org_id = ${orgId}
          `;
        }

        if (lockedSale.customer_id) {
          await tx`
            UPDATE customers
            SET total_orders = GREATEST(total_orders - 1, 0),
                total_spent  = GREATEST(total_spent  - ${lockedSale.total}, 0),
                updated_at   = CURRENT_TIMESTAMP,
                updated_by   = ${userId}
            WHERE id = ${lockedSale.customer_id} AND org_id = ${orgId}
          `;
        }
      }

      // 4. Soft-delete: se marca como cancelada en vez de borrarse, para
      // conservar trazabilidad (quién, cuándo, por qué).
      await tx`UPDATE sale_supplies SET deleted_at = NOW(), updated_by = ${userId} WHERE sale_id = ${saleId} AND org_id = ${orgId}`;
      await tx`UPDATE sale_items    SET deleted_at = NOW(), updated_by = ${userId} WHERE sale_id = ${saleId} AND org_id = ${orgId}`;
      await tx`
        UPDATE sales SET
          status               = 'CANCELLED',
          deleted_at           = NOW(),
          deleted_by           = ${userId},
          cancellation_reason  = ${reason},
          updated_at           = CURRENT_TIMESTAMP,
          updated_by           = ${userId}
        WHERE id = ${saleId} AND org_id = ${orgId} AND status <> 'CANCELLED'
      `;

      return Response.json({
        message: "Venta cancelada, inventario y balance revertidos",
        data: { id: saleId, status: "CANCELLED" },
      });
      });
    } catch (e) {
      if (e instanceof SaleStateConflictError) {
        return createErrorResponse(e.message, 409);
      }
      throw e;
    }

  } catch (error) {
    console.error("DELETE /api/sales/[id]:", error);
    return createErrorResponse("Error al cancelar la venta", 500);
  }
}
