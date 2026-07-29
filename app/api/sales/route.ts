// app/api/sales/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, getOrgTimezone, requireModule, verifyResourceLimit } from "@/lib/auth";
import { consumeFifo, InsufficientStockError } from "@/lib/fifo";

const sql = neon(process.env.DATABASE_URL!);

// ── Timezone-aware date helpers ────────────────────────────────────────────
// Returns the UTC offset in ms for a given IANA timezone at a specific instant.
// Works on Vercel (runtime = UTC) because toLocaleString is parsed as "UTC local".
function tzOffsetMs(tz: string, at: Date): number {
  const tzStr  = at.toLocaleString("en-US", { timeZone: tz });
  const utcStr = at.toLocaleString("en-US", { timeZone: "UTC" });
  return new Date(tzStr).getTime() - new Date(utcStr).getTime();
}

// Midnight (start of day) in the given timezone, expressed as a UTC Date.
function startOfDayTZ(d: Date, tz: string): Date {
  const ymd    = d.toLocaleDateString("sv", { timeZone: tz }); // "YYYY-MM-DD"
  const offset = tzOffsetMs(tz, d);
  const [y, m, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day, 0, 0, 0, 0) - offset);
}

function endOfDayTZ(d: Date, tz: string): Date {
  return new Date(startOfDayTZ(d, tz).getTime() + 86_400_000 - 1);
}

function startOfMonthTZ(d: Date, tz: string): Date {
  const ymd    = d.toLocaleDateString("sv", { timeZone: tz });
  const offset = tzOffsetMs(tz, d);
  const [y, m] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0) - offset);
}

function endOfMonthTZ(d: Date, tz: string): Date {
  const ymd    = d.toLocaleDateString("sv", { timeZone: tz });
  const offset = tzOffsetMs(tz, d);
  const [y, m] = ymd.split("-").map(Number);
  const firstOfNext = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0) - offset);
  return new Date(firstOfNext.getTime() - 1);
}

// Parse a "YYYY-MM-DD" string (local date in TZ) into a UTC boundary.
function parseDateTZ(dateStr: string, tz: string, edge: "start" | "end"): Date {
  const ref    = new Date(`${dateStr}T12:00:00Z`); // noon UTC as reference for offset
  const offset = tzOffsetMs(tz, ref);
  const [y, m, day] = dateStr.split("-").map(Number);
  const midnight = new Date(Date.UTC(y, m - 1, day, 0, 0, 0, 0) - offset);
  return edge === "start" ? midnight : new Date(midnight.getTime() + 86_400_000 - 1);
}

// ──────────────────────────────────────────────────────────────────────────

type Preset = "today" | "7d" | "this_month" | "last_month" | "all";

function resolveRange(params: URLSearchParams, tz: string) {
  const preset  = (params.get("preset") as Preset) || "this_month";
  const from    = params.get("from");
  const to      = params.get("to");
  const payment = params.get("payment");
  const now     = new Date();

  let fromDate: Date | null = null;
  let toDate:   Date | null = null;

  if (from || to) {
    if (from) fromDate = parseDateTZ(from, tz, "start");
    if (to)   toDate   = parseDateTZ(to,   tz, "end");
  } else {
    switch (preset) {
      case "today":
        fromDate = startOfDayTZ(now, tz);
        toDate   = endOfDayTZ(now, tz);
        break;
      case "7d": {
        const seven = new Date(now.getTime() - 6 * 86_400_000);
        fromDate = startOfDayTZ(seven, tz);
        toDate   = endOfDayTZ(now, tz);
        break;
      }
      case "this_month":
        fromDate = startOfMonthTZ(now, tz);
        toDate   = endOfMonthTZ(now, tz);
        break;
      case "last_month": {
        // "last month" relative to the current TZ date
        const ymd  = now.toLocaleDateString("sv", { timeZone: tz });
        const [y, m] = ymd.split("-").map(Number);
        const lastMonth = new Date(Date.UTC(y, m - 2, 15)); // mid of prev month
        fromDate = startOfMonthTZ(lastMonth, tz);
        toDate   = endOfMonthTZ(lastMonth, tz);
        break;
      }
      default:
        fromDate = null;
        toDate   = null;
    }
  }

  return {
    fromDateISO: fromDate?.toISOString() ?? null,
    toDateISO:   toDate?.toISOString()   ?? null,
    payment:     payment && payment !== "all" ? payment : null,
  };
}

// ── GET /api/sales ─────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'SALES', 'canView');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const { searchParams } = new URL(request.url);

    const tz = await getOrgTimezone(orgId);

    const { fromDateISO, toDateISO, payment } = resolveRange(searchParams, tz);

    const search    = searchParams.get("search")?.trim()   || null;
    const status    = searchParams.get("status")           || null;
    const accountId = searchParams.get("account_id")       || null;
    const page      = Math.max(1, Number(searchParams.get("page"))  || 1);
    const limit     = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 25));
    const offset    = (page - 1) * limit;

    // ── Stats (sin filtro de status, para los summary cards) ─────────
    const [statsRow] = await sql`
      SELECT
        COALESCE(SUM(s.total) FILTER (WHERE s.status = 'COMPLETED'), 0)   AS total_revenue,
        COALESCE(
          SUM(
            CASE WHEN s.status = 'COMPLETED'
              THEN COALESCE(prof.profit, 0) - COALESCE(s.tax, 0)
              ELSE 0
            END
          ), 0
        )                                                                   AS total_profit,
        COUNT(*) FILTER (WHERE s.status = 'PENDING')::int                  AS pending_count,
        COUNT(*) FILTER (WHERE s.status = 'COMPLETED')::int                AS completed_count
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN (
        SELECT sale_id, SUM(line_total - unit_cost * quantity) AS profit
        FROM sale_items GROUP BY sale_id
      ) prof ON prof.sale_id = s.id
      WHERE s.org_id = ${orgId}
        AND (${fromDateISO}::timestamptz IS NULL OR s.sold_at >= ${fromDateISO})
        AND (${toDateISO}::timestamptz   IS NULL OR s.sold_at <= ${toDateISO})
        AND (${payment}::text            IS NULL OR s.payment_method = ${payment})
        AND (${search}::text             IS NULL OR s.sale_number ILIKE ${'%' + (search ?? '') + '%'} OR c.name ILIKE ${'%' + (search ?? '') + '%'} OR s.notes ILIKE ${'%' + (search ?? '') + '%'})
        AND (${accountId}::text          IS NULL OR s.account_id::text = ${accountId})
    `;

    // ── Count para paginación (incluye filtro de status) ─────────────
    const [{ count }] = await sql`
      SELECT COUNT(s.id)::int AS count
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      WHERE s.org_id = ${orgId}
        AND (${fromDateISO}::timestamptz IS NULL OR s.sold_at >= ${fromDateISO})
        AND (${toDateISO}::timestamptz   IS NULL OR s.sold_at <= ${toDateISO})
        AND (${payment}::text            IS NULL OR s.payment_method = ${payment})
        AND (${search}::text             IS NULL OR s.sale_number ILIKE ${'%' + (search ?? '') + '%'} OR c.name ILIKE ${'%' + (search ?? '') + '%'} OR s.notes ILIKE ${'%' + (search ?? '') + '%'})
        AND (${accountId}::text          IS NULL OR s.account_id::text = ${accountId})
        AND (${status}::text             IS NULL OR s.status = ${status})
    `;

    const totalPages = Math.max(1, Math.ceil(count / limit));

    // ── Data paginada ─────────────────────────────────────────────────
    const sales = await sql`
      SELECT
        s.id,
        s.sale_number,
        s.customer_id,
        c.name         AS customer_name,
        s.subtotal,
        s.discount,
        s.shipping_cost,
        s.tax_rate,
        s.tax,
        s.total,
        s.payment_method,
        s.account_id,
        a.name         AS account_name,
        s.event_id,
        s.status,
        s.sold_at,
        s.notes,
        s.created_at,
        COUNT(si.id)::int AS items_count,
        CASE WHEN s.status = 'COMPLETED'
          THEN COALESCE(SUM(si.line_total - (si.unit_cost * si.quantity)), 0) - COALESCE(s.tax, 0)
          ELSE 0
        END AS net_profit
      FROM sales s
      LEFT JOIN customers  c  ON c.id      = s.customer_id
      LEFT JOIN accounts   a  ON a.id      = s.account_id
      LEFT JOIN sale_items si ON si.sale_id = s.id
      WHERE s.org_id = ${orgId}
        AND (${fromDateISO}::timestamptz IS NULL OR s.sold_at >= ${fromDateISO})
        AND (${toDateISO}::timestamptz   IS NULL OR s.sold_at <= ${toDateISO})
        AND (${payment}::text            IS NULL OR s.payment_method = ${payment})
        AND (${search}::text             IS NULL OR s.sale_number ILIKE ${'%' + (search ?? '') + '%'} OR c.name ILIKE ${'%' + (search ?? '') + '%'} OR s.notes ILIKE ${'%' + (search ?? '') + '%'})
        AND (${accountId}::text          IS NULL OR s.account_id::text = ${accountId})
        AND (${status}::text             IS NULL OR s.status = ${status})
      GROUP BY s.id, c.name, a.name
      ORDER BY s.sold_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return Response.json({
      data:       sales,
      total:      count,
      page,
      totalPages,
      limit,
      stats: {
        total_revenue:   Number(statsRow.total_revenue),
        total_profit:    Number(statsRow.total_profit),
        pending_count:   statsRow.pending_count,
        completed_count: statsRow.completed_count,
      },
    });
  } catch (error) {
    console.error("GET /api/sales:", error);
    return createErrorResponse("Error al obtener ventas", 500);
  }
}

// ── POST /api/sales ────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'SALES', 'canEdit');
  if (deny) return deny;

  const limit = await verifyResourceLimit(auth.data.orgId, "sales");
  if (!limit.withinLimit) {
    return createErrorResponse(limit.error ?? "Límite alcanzado", limit.status, "needsUpgrade" in limit ? !!limit.needsUpgrade : false);
  }

  try {
    const { userId, orgId } = auth.data;
    const body = await request.json();

    const {
      customer_id,
      items,
      discount,
      shipping_cost,
      tax_rate,
      payment_method,
      account_id,
      credit_card_id,
      sale_currency,
      exchange_rate,
      notes,
      sold_at,
      supplies_used,
      event_id,
      status = "COMPLETED",
    } = body;

    const isCreditCard = payment_method === "CREDIT_CARD";
    const isCreditCardUsd = isCreditCard && sale_currency === "USD";

    // ── Validaciones básicas ────────────────────────────────────────────
    if (!items || !Array.isArray(items) || items.length === 0)
      return createErrorResponse("Se requiere al menos un producto", 400);
    if (!payment_method)
      return createErrorResponse("El método de pago es requerido", 400);
    if (!isCreditCard && !account_id)
      return createErrorResponse("La cuenta de destino es requerida", 400);
    if (isCreditCard && !credit_card_id)
      return createErrorResponse("La tarjeta de crédito es requerida", 400);
    if (isCreditCardUsd && (!exchange_rate || Number(exchange_rate) <= 0))
      return createErrorResponse("La tasa de cambio es requerida para ventas en USD", 400);
    if (!["PENDING", "COMPLETED"].includes(status))
      return createErrorResponse("Estado inválido", 400);

    const taxRateNum = Number(tax_rate) || 0;
    if (![0, 15, 18].includes(taxRateNum))
      return createErrorResponse(
        "El porcentaje de impuesto debe ser 0, 15 o 18",
        400,
      );

    for (const item of items) {
      if (!item.product_id || !item.quantity || item.quantity <= 0)
        return createErrorResponse("Datos de producto inválidos", 400);
      if (item.unit_price === undefined || item.unit_price < 0)
        return createErrorResponse("El precio unitario es requerido", 400);
    }

    // ── Validar cuenta (solo si no es tarjeta de crédito) ──────────────
    if (!isCreditCard) {
      const [account] = await sql`
        SELECT id FROM accounts
        WHERE id = ${account_id} AND org_id = ${orgId} AND is_active = TRUE
      `;
      if (!account) return createErrorResponse("Cuenta no encontrada", 404);
    }

    // ── Validar tarjeta de crédito ──────────────────────────────────────
    if (isCreditCard) {
      const [card] = await sql`
        SELECT id FROM credit_cards
        WHERE id = ${Number(credit_card_id)} AND org_id = ${orgId} AND is_active = TRUE
      `;
      if (!card) return createErrorResponse("Tarjeta de crédito no encontrada", 404);
    }

    // ── Validar evento ──────────────────────────────────────────────────
    const eventIdNum = event_id ? Number(event_id) : null;
    if (eventIdNum) {
      const [ev] = await sql`
        SELECT id FROM events WHERE id = ${eventIdNum} AND org_id = ${orgId}
      `;
      if (!ev) return createErrorResponse("Evento no encontrado", 404);
    }

    // ── FIFO — productos físicos con soporte de variantes ───────────────
    const processedItems: any[] = [];

    for (const item of items) {
      const variantId = item.variant_id ? Number(item.variant_id) : null;

      // Verificar producto
      const [product] = await sql`
        SELECT id, name, is_service FROM products
        WHERE id = ${item.product_id} AND org_id = ${orgId} AND is_active = TRUE
      `;
      if (!product)
        return createErrorResponse(
          `Producto #${item.product_id} no encontrado`,
          404,
        );

      // Servicio: sin inventario
      if (product.is_service) {
        processedItems.push({
          product_id: item.product_id,
          variant_id: variantId,
          quantity: item.quantity,
          unit_price: item.unit_price,
          unit_cost: 0,
          item_discount: item.discount ?? 0,
          line_total: item.unit_price * item.quantity - (item.discount ?? 0),
          batches: [],
          is_service: true,
          label: product.name,
        });
        continue;
      }

      // Validar variante si se envió — debe pertenecer al producto y estar activa
      let variantName: string | null = null;
      if (variantId !== null) {
        const [variant] = await sql`
          SELECT id, variant_name, price_override
          FROM product_variants
          WHERE id         = ${variantId}
            AND product_id = ${item.product_id}
            AND org_id     = ${orgId}
            AND is_active  = TRUE
        `;
        if (!variant)
          return createErrorResponse(
            `Variante #${variantId} no encontrada o no pertenece a "${product.name}"`,
            404,
          );
        variantName = variant.variant_name;
      }

      // FIFO: filtrar batches por product_id + variant_id
      // Si variant_id es null → buscar batches sin variante asignada
      // Si variant_id tiene valor → buscar batches de esa variante
      const batches =
        variantId !== null
          ? await sql`
            SELECT id, qty_available, unit_cost
            FROM inventory_batches
            WHERE org_id     = ${orgId}
              AND product_id = ${item.product_id}
              AND variant_id = ${variantId}
              AND qty_available > 0
            ORDER BY received_at ASC
          `
          : await sql`
            SELECT id, qty_available, unit_cost
            FROM inventory_batches
            WHERE org_id     = ${orgId}
              AND product_id = ${item.product_id}
              AND variant_id IS NULL
              AND qty_available > 0
            ORDER BY received_at ASC
          `;

      const totalAvailable = batches.reduce(
        (acc: number, b: any) => acc + Number(b.qty_available),
        0,
      );

      const label =
        variantId !== null
          ? `${product.name} (${variantName ?? `variante #${variantId}`})`
          : product.name;

      if (totalAvailable < item.quantity) {
        const [product] =
          await sql`SELECT name FROM products WHERE id = ${item.product_id}`;
        return createErrorResponse(
          `Stock insuficiente para "${label}". Disponible: ${totalAvailable}`,
          400,
        );
      }

      // Calcular costo promedio FIFO
      let remaining = item.quantity;
      let totalCost = 0;
      for (const batch of batches) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, Number(batch.qty_available));
        totalCost += take * Number(batch.unit_cost);
        remaining -= take;
      }

      processedItems.push({
        product_id: item.product_id,
        variant_id: variantId,
        quantity: item.quantity,
        unit_price: item.unit_price,
        unit_cost: totalCost / item.quantity,
        item_discount: item.discount ?? 0,
        line_total: item.unit_price * item.quantity - (item.discount ?? 0),
        batches,
        is_service: false,
        label,
      });
    }

    // ── Suministros ─────────────────────────────────────────────────────
    const normalizedSupplies: any[] = [];
    if (Array.isArray(supplies_used) && supplies_used.length > 0) {
      for (const s of supplies_used) {
        const supply_id = Number(s.supply_id);
        const quantity = Number(s.quantity);
        const unit_cost = Number(s.unit_cost);
        if (!supply_id || quantity <= 0)
          return createErrorResponse("Datos de suministro inválidos", 400);
        const [supply] = await sql`
          SELECT id FROM supplies WHERE id = ${supply_id} AND org_id = ${orgId}
        `;
        if (!supply)
          return createErrorResponse(
            `Suministro #${supply_id} no encontrado`,
            404,
          );
        normalizedSupplies.push({
          supply_id,
          quantity,
          unit_cost,
          line_total: quantity * unit_cost,
        });
      }
    }

    // ── Cálculos TAX-INCLUSIVE ──────────────────────────────────────────
    const subtotal = processedItems.reduce(
      (acc, i) => acc + i.unit_price * i.quantity,
      0,
    );
    const globalDiscount = Number(discount) || 0;
    const totalItemDiscounts = processedItems.reduce(
      (acc, i) => acc + i.item_discount,
      0,
    );
    const totalDiscount = globalDiscount + totalItemDiscounts;
    const shippingAmount = Number(shipping_cost) || 0;
    const taxableBase = subtotal - totalDiscount;
    const taxAmount =
      taxRateNum > 0 ? (taxableBase * taxRateNum) / (100 + taxRateNum) : 0;
    const grandTotal = taxableBase + shippingAmount;
    const suppliesCost = normalizedSupplies.reduce(
      (acc, s) => acc + s.line_total,
      0,
    );
    const occurredAt = sold_at ?? new Date().toISOString();

    // ══════════════════════════════════════════════════════════════════
    await sql`BEGIN`;
    try {
      // ── Número de venta (advisory lock evita duplicados bajo concurrencia) ──
      await sql`SELECT pg_advisory_xact_lock(${orgId})`;
      const [lastSale] = await sql`
        SELECT MAX(CAST(REGEXP_REPLACE(sale_number, '[^0-9]', '', 'g') AS INTEGER)) AS last_num
        FROM sales
        WHERE org_id = ${orgId}
      `;
      const lastNum = lastSale?.last_num ? Number(lastSale.last_num) : 0;
      const saleNumber = `VTA-${String(lastNum + 1).padStart(5, "0")}`;

      const txParts: string[] = [`Venta ${saleNumber}`];
      if (taxRateNum > 0) txParts.push(`ISV ${taxRateNum}% incluido`);
      if (shippingAmount > 0)
        txParts.push(`envío L ${shippingAmount.toFixed(2)}`);
      const txDescription =
        txParts.length > 1
          ? `${txParts[0]} (${txParts.slice(1).join(", ")})`
          : txParts[0];
      // 1. Crear venta
      const [sale] = await sql`
        INSERT INTO sales (
          org_id, created_by, sale_number, customer_id,
          subtotal, discount, tax_rate, tax, shipping_cost, total,
          payment_method, account_id, credit_card_id, event_id,
          status, sold_at, notes
        ) VALUES (
          ${orgId}, ${userId}, ${saleNumber}, ${customer_id ?? null},
          ${subtotal}, ${totalDiscount}, ${taxRateNum}, ${taxAmount},
          ${shippingAmount}, ${grandTotal},
          ${payment_method},
          ${isCreditCard ? null : account_id},
          ${isCreditCard ? Number(credit_card_id) : null},
          ${eventIdNum},
          ${status}, ${occurredAt}::timestamptz, ${notes ?? null}
        )
        RETURNING id
      `;
      const saleId = sale.id as number;

      // 2. Items + FIFO con variantes
      // El descuento de lotes es atómico y con guarda (ver lib/fifo.ts):
      // bajo concurrencia nunca sobregira el stock. El costo real consumido
      // reemplaza al estimado del pre-chequeo.
      for (const item of processedItems) {
        if (!item.is_service) {
          const consumed = await consumeFifo(
            sql, orgId, item.product_id, item.variant_id, item.quantity
          );
          if (!consumed) throw new InsufficientStockError(item.label);
          item.unit_cost = consumed.totalCost / item.quantity;
        }

        await sql`
          INSERT INTO sale_items (
            org_id, created_by, sale_id, product_id, variant_id,
            quantity, unit_price, unit_cost, line_total
          ) VALUES (
            ${orgId}, ${userId}, ${saleId},
            ${item.product_id}, ${item.variant_id},
            ${item.quantity}, ${item.unit_price},
            ${item.unit_cost}, ${item.line_total}
          )
        `;

        if (!item.is_service) {
          await sql`
            INSERT INTO inventory_movements (
              org_id, created_by, movement_type, product_id, variant_id,
              quantity, reference_type, reference_id
            ) VALUES (
              ${orgId}, ${userId}, 'OUT',
              ${item.product_id}, ${item.variant_id},
              ${item.quantity}, 'SALE', ${saleId}
            )
          `;
        }
      }

      // 3. Suministros (SIEMPRE)
      for (const s of normalizedSupplies) {
        await sql`
          INSERT INTO sale_supplies (
            org_id, created_by, sale_id, supply_id,
            quantity, unit_cost, line_total
          )
          VALUES (
            ${orgId}, ${userId}, ${saleId}, ${s.supply_id},
            ${s.quantity}, ${s.unit_cost}, ${s.line_total}
          )
        `;
        await sql`
          UPDATE supplies
          SET stock = GREATEST(0, stock - ${s.quantity})
          WHERE id = ${s.supply_id} AND org_id = ${orgId}
        `;
        await sql`
          INSERT INTO supply_movements (
            org_id, created_by, movement_type, supply_id,
            quantity, reference_type, reference_id
          )
          VALUES (
            ${orgId}, ${userId}, 'OUT', ${s.supply_id},
            ${s.quantity}, 'SALE', ${saleId}
          )
        `;
      }

      // 4. Transacción + balance + cliente — solo si COMPLETED
      if (status === "COMPLETED") {
        if (isCreditCard) {
          // Cargo a tarjeta de crédito
          const chargeAmount = isCreditCardUsd ? Number(grandTotal) : grandTotal;
          const chargeCurrency = isCreditCardUsd ? "USD" : (sale_currency ?? "LOCAL");
          const rateNum = isCreditCardUsd ? Number(exchange_rate) : null;
          const localEquivalent = isCreditCardUsd ? grandTotal * Number(exchange_rate) : grandTotal;

          await sql`
            INSERT INTO credit_card_transactions (
              org_id, created_by, credit_card_id, type, description,
              amount, currency, exchange_rate, amount_local,
              sale_id, occurred_at
            ) VALUES (
              ${orgId}, ${userId}, ${Number(credit_card_id)}, 'CHARGE', ${txDescription},
              ${chargeAmount}, ${chargeCurrency}, ${rateNum},
              ${localEquivalent}, ${saleId}, ${occurredAt}::timestamptz
            )
          `;

          if (isCreditCardUsd) {
            await sql`
              UPDATE credit_cards
              SET balance_usd = balance_usd + ${chargeAmount}, updated_at = NOW()
              WHERE id = ${Number(credit_card_id)} AND org_id = ${orgId}
            `;
          } else {
            await sql`
              UPDATE credit_cards
              SET balance = balance + ${chargeAmount}, updated_at = NOW()
              WHERE id = ${Number(credit_card_id)} AND org_id = ${orgId}
            `;
          }
        } else {
          const txRefType = eventIdNum ? "EVENT" : "SALE";
          const txRefId = eventIdNum ? eventIdNum : saleId;

          await sql`
            INSERT INTO transactions (
              org_id, created_by, type, account_id, amount,
              category, description,
              reference_type, reference_id, occurred_at
            ) VALUES (
              ${orgId}, ${userId}, 'INCOME', ${account_id}, ${grandTotal},
              'Ventas', ${txDescription},
              ${txRefType}, ${txRefId}, ${occurredAt}::timestamptz
            )
          `;

          await sql`
            UPDATE accounts
            SET balance = balance + ${grandTotal}
            WHERE id = ${account_id} AND org_id = ${orgId}
          `;
        }

        if (customer_id) {
          await sql`
            UPDATE customers
            SET total_orders = total_orders + 1,
                total_spent  = total_spent  + ${grandTotal},
                updated_at   = CURRENT_TIMESTAMP,
                updated_by   = ${userId}
            WHERE id = ${customer_id} AND org_id = ${orgId}
          `;
        }
      }

      await sql`COMMIT`;

      return Response.json(
        {
          message:
            status === "PENDING"
              ? "Venta pendiente registrada"
              : "Venta registrada exitosamente",
          data: {
            id: saleId,
            sale_number: saleNumber,
            status,
            subtotal,
            discount: totalDiscount,
            tax_rate: taxRateNum,
            tax: taxAmount,
            shipping_cost: shippingAmount,
            supplies_cost: suppliesCost,
            total: grandTotal,
          },
        },
        { status: 201 },
      );
    } catch (innerError) {
      await sql`ROLLBACK`;
      if (innerError instanceof InsufficientStockError) {
        return createErrorResponse(
          `${innerError.message}. Otra venta pudo haber consumido el stock al mismo tiempo`,
          409,
        );
      }
      throw innerError;
    }
  } catch (error) {
    console.error("POST /api/sales:", error);
    return createErrorResponse("Error al registrar la venta", 500);
  }
}
