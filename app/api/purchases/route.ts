// app/api/purchases/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule, getModulePermissions, nullifyKeysDeep } from "@/lib/auth";
import { INVENTORY_PURCHASE_CATEGORY } from "@/lib/seed-default-categories";
import { resolveWarehouseId } from "@/lib/warehouses";

const sql = neon(process.env.DATABASE_URL!);

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'INVENTORY', 'canEdit', 'INCOMING');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const body       = await request.json();

    const {
      account_id, credit_card_id, shipping_account_id, currency, exchange_rate,
      shipping, notes, purchased_at, items, warehouse_id,
      status = "COMPLETED",
    } = body;

    const isCreditCard = !!credit_card_id && !account_id;

    const wh = await resolveWarehouseId(sql, orgId, warehouse_id);
    if (wh.warehouseId === null) return createErrorResponse(wh.error, 400);
    const warehouseId: number = wh.warehouseId;

    if (status !== "PENDING" && status !== "COMPLETED")
      return createErrorResponse("Estado inválido", 400);

    // ── Validaciones básicas ────────────────────────────────────────
    if (!isCreditCard && !account_id)
      return createErrorResponse("La cuenta es requerida", 400);
    if (isCreditCard && !credit_card_id)
      return createErrorResponse("La tarjeta de crédito es requerida", 400);
    if (!items || !Array.isArray(items) || items.length === 0)
      return createErrorResponse("Se requiere al menos un producto", 400);

    for (const item of items) {
      if (!item.product_id || !item.quantity || item.quantity <= 0)
        return createErrorResponse("Datos de producto inválidos", 400);
      if (item.unit_cost_usd === undefined || item.unit_cost_usd < 0)
        return createErrorResponse("El costo unitario es requerido", 400);
    }

    // ── Validar cuenta o tarjeta ────────────────────────────────────
    if (!isCreditCard) {
      const [account] = await sql`
        SELECT id FROM accounts WHERE id = ${account_id} AND org_id = ${orgId} AND is_active = TRUE
      `;
      if (!account) return createErrorResponse("Cuenta no encontrada", 404);
    } else {
      const [card] = await sql`
        SELECT id FROM credit_cards WHERE id = ${Number(credit_card_id)} AND org_id = ${orgId} AND is_active = TRUE
      `;
      if (!card) return createErrorResponse("Tarjeta de crédito no encontrada", 404);
    }

    // ── Validar productos y variantes ───────────────────────────────
    const productInfoMap = new Map<number, { name: string; sku: string | null }>();
    for (const item of items) {
      const [product] = await sql`
        SELECT id, name, sku, is_service FROM products
        WHERE id = ${item.product_id} AND org_id = ${orgId} AND is_active = TRUE
      `;
      if (!product)
        return createErrorResponse(`Producto #${item.product_id} no encontrado`, 404);
      if (product.is_service)
        return createErrorResponse(
          `"${product.name}" es un servicio y no puede tener compras de inventario`,
          400
        );
      productInfoMap.set(item.product_id, { name: product.name, sku: product.sku ?? null });

      if (item.variant_id) {
        const [variant] = await sql`
          SELECT id FROM product_variants
          WHERE id         = ${Number(item.variant_id)}
            AND product_id = ${item.product_id}
            AND org_id     = ${orgId}
            AND is_active  = TRUE
        `;
        if (!variant)
          return createErrorResponse(
            `Variante #${item.variant_id} no encontrada o no pertenece al producto #${item.product_id}`,
            404
          );
      }
    }

    // ── Calcular costos ─────────────────────────────────────────────
    const rate          = Number(exchange_rate) || 1;
    const shippingTotal = Number(shipping)      || 0; // siempre en moneda local
    const curr          = currency || "HNL";
    const isUsd         = curr === "USD";
    const totalUnits    = items.reduce((acc: number, i: any) => acc + Number(i.quantity), 0);

    // Shipping ingresado en moneda local — distribuir por unidad directamente
    const shippingPerUnitLocal = totalUnits > 0 ? shippingTotal / totalUnits : 0;

    const processedItems = items.map((item: any) => {
      const qty                = Number(item.quantity);
      const unitCostInCurrency = Number(item.unit_cost_usd); // en moneda de compra (USD o HNL)
      const unitCostLocal      = isUsd ? unitCostInCurrency * rate : unitCostInCurrency;
      const finalUnitCostLocal = unitCostLocal + shippingPerUnitLocal;

      return {
        product_id:        Number(item.product_id),
        variant_id:        item.variant_id ? Number(item.variant_id) : null,
        quantity:          qty,
        unit_cost_usd:     unitCostInCurrency,       // en moneda de compra
        unit_cost:         finalUnitCostLocal,        // en moneda local (para COGS)
        total_cost:        finalUnitCostLocal * qty,  // en moneda local
        total_in_currency: unitCostInCurrency * qty,  // en moneda de compra, sin envío
      };
    });

    // totalInCurrency: sólo productos en moneda de compra (para CC)
    // totalLocal: productos + envío en moneda local (para cuentas)
    const totalInCurrency = processedItems.reduce((acc: number, i: any) => acc + i.total_in_currency, 0);
    const totalLocal      = processedItems.reduce((acc: number, i: any) => acc + i.total_cost, 0);
    const productsLocal   = totalLocal - shippingTotal;
    const subtotal        = totalLocal;
    const total           = totalLocal;
    const occurredAt      = purchased_at ?? new Date().toISOString();

    // ¿Se paga el envío desde una cuenta separada?
    const shippingAccId      = shipping_account_id ? Number(shipping_account_id) : null;
    const hasShippingAccount = !!shippingAccId && shippingTotal > 0;

    let txDescription: string;
    if (processedItems.length === 1) {
      const info = productInfoMap.get(processedItems[0].product_id);
      txDescription = `Compra — ${info?.name ?? 'producto'}${info?.sku ? ` (${info.sku})` : ''}`;
    } else {
      txDescription = `Compra de ${processedItems.length} productos`;
    }

    // ── Transacción atómica ─────────────────────────────────────────
    await sql`BEGIN`;
    try {
      // 1. Crear purchase_batch
      const [batch] = await sql`
        INSERT INTO purchase_batches (
          org_id, created_by, account_id, shipping_account_id, currency, exchange_rate,
          subtotal, shipping, tax, total,
          is_paid, purchased_at, notes, status, warehouse_id
        ) VALUES (
          ${orgId}, ${userId}, ${isCreditCard ? null : account_id}, ${shippingAccId},
          ${curr}, ${rate},
          ${subtotal}, ${shippingTotal}, ${0}, ${total},
          ${false}, ${occurredAt}, ${notes ?? null}, ${status}, ${warehouseId}
        )
        RETURNING id
      `;
      const purchaseBatchId = batch.id as number;

      // 2. Items (+ inventory sólo si status = COMPLETED)
      for (const item of processedItems) {
        const [batchItem] = await sql`
          INSERT INTO purchase_batch_items (
            org_id, created_by, purchase_batch_id, product_id, variant_id,
            quantity, unit_cost_usd, unit_cost, total_cost
          ) VALUES (
            ${orgId}, ${userId}, ${purchaseBatchId},
            ${item.product_id}, ${item.variant_id},
            ${item.quantity}, ${item.unit_cost_usd},
            ${item.unit_cost}, ${item.total_cost}
          )
          RETURNING id
        `;

        if (status === "COMPLETED") {
          await sql`
            INSERT INTO inventory_batches (
              org_id, created_by, product_id, variant_id, purchase_batch_item_id,
              qty_in, qty_available, unit_cost, received_at, warehouse_id
            ) VALUES (
              ${orgId}, ${userId}, ${item.product_id}, ${item.variant_id}, ${batchItem.id},
              ${item.quantity}, ${item.quantity}, ${item.unit_cost}, ${occurredAt}, ${warehouseId}
            )
          `;

          await sql`
            INSERT INTO inventory_movements (
              org_id, created_by, movement_type, product_id, variant_id,
              quantity, reference_type, reference_id, notes, warehouse_id
            ) VALUES (
              ${orgId}, ${userId}, 'IN', ${item.product_id}, ${item.variant_id},
              ${item.quantity}, 'PURCHASE', ${purchaseBatchId}, ${notes ?? null}, ${warehouseId}
            )
          `;
        }
      }

      // 3. Movimiento financiero
      if (isCreditCard) {
        // CC se carga solo por los productos; el envío va a cuenta separada (si aplica)
        const ccAmount      = totalInCurrency; // siempre productos en moneda de compra
        const ccAmountLocal = hasShippingAccount ? productsLocal : totalLocal;
        await sql`
          INSERT INTO credit_card_transactions (
            org_id, created_by, credit_card_id, type, description,
            amount, currency, exchange_rate, amount_local,
            purchase_batch_id, category, occurred_at
          ) VALUES (
            ${orgId}, ${userId}, ${Number(credit_card_id)}, 'CHARGE', ${txDescription},
            ${ccAmount}, ${curr}, ${isUsd ? rate : null}, ${ccAmountLocal},
            ${purchaseBatchId}, ${INVENTORY_PURCHASE_CATEGORY}, ${occurredAt}
          )
        `;
        if (isUsd) {
          await sql`UPDATE credit_cards SET balance_usd = balance_usd + ${ccAmount}, updated_at = NOW(), updated_by = ${userId} WHERE id = ${Number(credit_card_id)} AND org_id = ${orgId}`;
        } else {
          await sql`UPDATE credit_cards SET balance = balance + ${ccAmount}, updated_at = NOW(), updated_by = ${userId} WHERE id = ${Number(credit_card_id)} AND org_id = ${orgId}`;
        }
        if (hasShippingAccount) {
          await sql`
            INSERT INTO transactions (
              org_id, created_by, account_id, type, amount,
              description, category, reference_type, reference_id, occurred_at
            ) VALUES (
              ${orgId}, ${userId}, ${shippingAccId}, 'EXPENSE', ${shippingTotal},
              ${'Pago de envío'}, ${INVENTORY_PURCHASE_CATEGORY}, 'PURCHASE_SHIPPING', ${purchaseBatchId}, ${occurredAt}
            )
          `;
          await sql`UPDATE accounts SET balance = balance - ${shippingTotal}, updated_by = ${userId} WHERE id = ${shippingAccId} AND org_id = ${orgId}`;
        }
      } else if (hasShippingAccount) {
        // Productos desde cuenta principal; envío desde cuenta separada
        await sql`
          INSERT INTO transactions (
            org_id, created_by, account_id, type, amount,
            description, category, reference_type, reference_id, occurred_at
          ) VALUES (
            ${orgId}, ${userId}, ${account_id}, 'EXPENSE', ${productsLocal},
            ${txDescription}, ${INVENTORY_PURCHASE_CATEGORY}, 'PURCHASE', ${purchaseBatchId}, ${occurredAt}
          )
        `;
        await sql`UPDATE accounts SET balance = balance - ${productsLocal}, updated_by = ${userId} WHERE id = ${account_id} AND org_id = ${orgId}`;
        await sql`
          INSERT INTO transactions (
            org_id, created_by, account_id, type, amount,
            description, category, reference_type, reference_id, occurred_at
          ) VALUES (
            ${orgId}, ${userId}, ${shippingAccId}, 'EXPENSE', ${shippingTotal},
            ${'Pago de envío'}, ${INVENTORY_PURCHASE_CATEGORY}, 'PURCHASE_SHIPPING', ${purchaseBatchId}, ${occurredAt}
          )
        `;
        await sql`UPDATE accounts SET balance = balance - ${shippingTotal}, updated_by = ${userId} WHERE id = ${shippingAccId} AND org_id = ${orgId}`;
      } else {
        await sql`
          INSERT INTO transactions (
            org_id, created_by, account_id, type, amount,
            description, category, reference_type, reference_id, occurred_at
          ) VALUES (
            ${orgId}, ${userId}, ${account_id}, 'EXPENSE', ${total},
            ${txDescription}, ${INVENTORY_PURCHASE_CATEGORY}, 'PURCHASE', ${purchaseBatchId}, ${occurredAt}
          )
        `;
        await sql`UPDATE accounts SET balance = balance - ${total}, updated_by = ${userId} WHERE id = ${account_id} AND org_id = ${orgId}`;
      }

      await sql`COMMIT`;

      return Response.json(
        {
          message: status === "PENDING"
            ? "Compra registrada como pendiente"
            : "Compra registrada exitosamente",
          data: {
            id:    purchaseBatchId,
            total,
            items: processedItems.length,
          },
        },
        { status: 201 }
      );

    } catch (innerError) {
      await sql`ROLLBACK`;
      throw innerError;
    }

  } catch (error) {
    console.error("POST /api/purchases:", error);
    return createErrorResponse("Error al registrar la compra", 500);
  }
}

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'INVENTORY', 'canView', 'INCOMING');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const { searchParams } = new URL(request.url);
    const statusFilter   = searchParams.get("status") || null;
    const withItems      = searchParams.get("with_items") === "true";

    const purchases = await sql`
      SELECT
        pb.id,
        pb.public_id,
        pb.account_id,
        a.name   AS account_name,
        pb.shipping_account_id,
        sa.name  AS shipping_account_name,
        pb.currency,
        pb.exchange_rate,
        pb.subtotal,
        pb.shipping,
        pb.total,
        pb.status,
        pb.is_paid,
        pb.purchased_at,
        pb.notes,
        pb.created_at,
        COUNT(pbi.id)::int AS items_count,
        ${withItems ? sql`
          COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'product_id',   pbi2.product_id,
              'product_name', p.name,
              'variant_name', pv.variant_name,
              'quantity',     pbi2.quantity,
              'unit_cost',    pbi2.unit_cost,
              'unit_cost_usd', pbi2.unit_cost_usd
            ) ORDER BY pbi2.id)
            FROM purchase_batch_items pbi2
            JOIN products p ON p.id = pbi2.product_id
            LEFT JOIN product_variants pv ON pv.id = pbi2.variant_id
            WHERE pbi2.purchase_batch_id = pb.id
          ), '[]'::jsonb) AS items
        ` : sql`NULL::jsonb AS items`}
      FROM purchase_batches pb
      LEFT JOIN accounts             a   ON a.id  = pb.account_id
      LEFT JOIN accounts             sa  ON sa.id = pb.shipping_account_id
      LEFT JOIN purchase_batch_items pbi ON pbi.purchase_batch_id = pb.id
      WHERE pb.org_id = ${orgId}
        AND (${statusFilter}::text IS NULL OR pb.status = ${statusFilter})
      GROUP BY pb.id, a.name, sa.name
      ORDER BY pb.purchased_at DESC
    `;

    const payload = { data: purchases, total: purchases.length };

    // Toda esta respuesta es información de costo (lo que costó adquirir el
    // inventario) — sin show_costs se anula subtotal/shipping/total del lote
    // y unit_cost/unit_cost_usd de cada item.
    const perms = await getModulePermissions(auth.data, 'INVENTORY', 'INCOMING');
    if (!perms.showCosts) {
      nullifyKeysDeep(payload, new Set([
        "subtotal", "shipping", "total", "unit_cost", "unit_cost_usd",
      ]));
    }

    return Response.json(payload);
  } catch (error) {
    console.error("GET /api/purchases:", error);
    return createErrorResponse("Error al obtener compras", 500);
  }
}