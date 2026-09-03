// lib/reports/queries.ts
//
// Queries compartidas entre la pantalla (GET) y la exportación (POST) de cada
// reporte. Antes vivían duplicadas en ambos handlers y habían divergido: los
// exports sumaban `sales.total` sobre un JOIN directo a `sale_items` (1:N),
// multiplicando los ingresos por el número de líneas de cada venta. Toda
// query que cruce `sales` con `sale_items` para sumar totales de venta debe
// pre-agregar `sale_items` por `sale_id` primero (ver el CTE `item_costs`
// repetido más abajo, o `sale_agg` en `getEventRows`).
//
// Contrato: cambiar una cifra aquí la cambia a la vez en pantalla y en el
// documento exportado. No dupliques estas queries en las rutas.

import type { NeonQueryFunction } from "@neondatabase/serverless";
import type {
  SalesSummary, SalesByDay, SalesByProduct, SaleDetail,
  InventorySummary, InventoryProduct, InventoryMovement,
  ProfitSummary, ProfitByMonth, ProfitByProduct,
  EventRow,
} from "@/hooks/swr/use-reports";

type Sql = NeonQueryFunction<false, false>;

export const SALES_BY_PRODUCT_LIMIT   = 100;
export const PROFIT_BY_PRODUCT_LIMIT  = 100;
export const SALES_DETAIL_LIMIT       = 1000;
export const INVENTORY_MOVEMENTS_LIMIT = 200;
export const INVENTORY_MOVEMENTS_DAYS  = 30;

// Transacciones que representan adquisición de activo (inventario, insumos)
// o traslado de deuda (pago de tarjeta) — no son gasto operativo del período
// y ya se reflejan como COGS al momento de la venta. Excluirlas evita
// contarlas dos veces en el resumen de rentabilidad.
export const NON_OPERATING_EXPENSE_REF_TYPES = [
  "PURCHASE", "PURCHASE_SHIPPING", "SUPPLY_PURCHASE", "CREDIT_CARD_PAYMENT",
] as const;

// Fragmento SQL fijo (no depende de entrada del usuario) para el filtro de
// arriba. Se arma una vez a partir de la constante para no repetir la lista
// literal dentro de la query.
const NON_OPERATING_REF_TYPES_SQL_LIST = NON_OPERATING_EXPENSE_REF_TYPES.map(t => `'${t}'`).join(", ");

export function defaultMonthRange() {
  const now  = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { from, to };
}

export function defaultYearRange() {
  const now  = new Date();
  const from = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
  const to   = new Date(now.getFullYear(), 11, 31).toISOString().slice(0, 10);
  return { from, to };
}

// ── Ventas ───────────────────────────────────────────────────────────────

export async function getSalesSummary(
  sql: Sql, orgId: number, from: string, to: string
): Promise<SalesSummary> {
  const [summary] = await sql`
    WITH item_costs AS (
      SELECT sale_id, SUM(unit_cost * quantity) AS cogs
      FROM sale_items
      WHERE org_id = ${orgId}
      GROUP BY sale_id
    )
    SELECT
      COUNT(DISTINCT s.id)::int                                    AS total_sales,
      COALESCE(SUM(s.total),    0)::float                          AS total_revenue,
      COALESCE(SUM(s.discount), 0)::float                          AS total_discount,
      COALESCE(SUM(ic.cogs), 0)::float                             AS total_cogs,
      COALESCE(SUM(s.total) - SUM(ic.cogs), 0)::float              AS gross_profit
    FROM sales s
    LEFT JOIN item_costs ic ON ic.sale_id = s.id
    WHERE s.org_id = ${orgId}
      AND s.status  = 'COMPLETED'
      AND s.sold_at >= ${from}::date
      AND s.sold_at <  (${to}::date + INTERVAL '1 day')
  `;
  return summary as unknown as SalesSummary;
}

export async function getSalesByDay(
  sql: Sql, orgId: number, from: string, to: string
): Promise<SalesByDay[]> {
  const rows = await sql`
    WITH item_costs AS (
      SELECT sale_id, SUM(unit_cost * quantity) AS cogs
      FROM sale_items
      WHERE org_id = ${orgId}
      GROUP BY sale_id
    )
    SELECT
      DATE(s.sold_at)::text                     AS date,
      COUNT(*)::int                             AS sales_count,
      COALESCE(SUM(s.total), 0)::float          AS revenue,
      COALESCE(SUM(s.total) - SUM(ic.cogs), 0)::float AS profit
    FROM sales s
    LEFT JOIN item_costs ic ON ic.sale_id = s.id
    WHERE s.org_id = ${orgId}
      AND s.status  = 'COMPLETED'
      AND s.sold_at >= ${from}::date
      AND s.sold_at <  (${to}::date + INTERVAL '1 day')
    GROUP BY DATE(s.sold_at)
    ORDER BY DATE(s.sold_at)
  `;
  return rows as unknown as SalesByDay[];
}

export async function getSalesByProduct(
  sql: Sql, orgId: number, from: string, to: string, limit = SALES_BY_PRODUCT_LIMIT
): Promise<SalesByProduct[]> {
  const rows = await sql`
    SELECT
      p.name                                                  AS product_name,
      COALESCE(p.sku, '')                                     AS sku,
      SUM(si.quantity)::int                                   AS qty_sold,
      COALESCE(SUM(si.line_total), 0)::float                 AS revenue,
      COALESCE(SUM(si.unit_cost * si.quantity), 0)::float   AS cogs,
      COALESCE(SUM(si.line_total - si.unit_cost * si.quantity), 0)::float AS profit,
      CASE
        WHEN SUM(si.line_total) > 0
        THEN ROUND(100.0 * SUM(si.line_total - si.unit_cost * si.quantity) / SUM(si.line_total), 1)
        ELSE 0
      END::float AS margin_pct
    FROM sale_items si
    JOIN products p ON p.id = si.product_id
    JOIN sales    s ON s.id = si.sale_id
    WHERE si.org_id = ${orgId}
      AND s.status   = 'COMPLETED'
      AND s.sold_at  >= ${from}::date
      AND s.sold_at  <  (${to}::date + INTERVAL '1 day')
    GROUP BY p.id, p.name, p.sku
    ORDER BY revenue DESC
    LIMIT ${limit}
  `;
  return rows as unknown as SalesByProduct[];
}

export async function getSalesDetail(
  sql: Sql, orgId: number, from: string, to: string, limit = SALES_DETAIL_LIMIT
): Promise<SaleDetail[]> {
  const rows = await sql`
    SELECT
      s.sale_number,
      DATE(s.sold_at)::text                                                  AS date,
      COALESCE(c.name, 'Sin cliente')                                        AS customer,
      s.payment_method,
      COALESCE(a.name, '')                                                   AS account_name,
      COUNT(si.id)::int                                                       AS items_count,
      COALESCE(s.discount, 0)::float                                         AS discount,
      COALESCE(SUM(si.unit_cost * si.quantity), 0)::float                   AS cogs,
      s.total::float                                                          AS total,
      COALESCE(s.total - SUM(si.unit_cost * si.quantity), 0)::float         AS profit
    FROM sales s
    LEFT JOIN customers  c  ON c.id  = s.customer_id
    LEFT JOIN accounts   a  ON a.id  = s.account_id
    LEFT JOIN sale_items si ON si.sale_id = s.id AND si.org_id = ${orgId}
    WHERE s.org_id = ${orgId}
      AND s.status  = 'COMPLETED'
      AND s.sold_at >= ${from}::date
      AND s.sold_at <  (${to}::date + INTERVAL '1 day')
    GROUP BY s.id, s.sale_number, s.sold_at, c.name, s.payment_method, a.name, s.discount, s.total
    ORDER BY s.sold_at DESC
    LIMIT ${limit}
  `;
  return rows as unknown as SaleDetail[];
}

// ── Rentabilidad ─────────────────────────────────────────────────────────

export async function getProfitSummary(
  sql: Sql, orgId: number, from: string, to: string
): Promise<ProfitSummary> {
  const [summary] = await sql`
    WITH item_costs AS (
      SELECT sale_id, SUM(unit_cost * quantity) AS cogs
      FROM sale_items
      WHERE org_id = ${orgId}
      GROUP BY sale_id
    )
    SELECT
      COALESCE(SUM(s.total), 0)::float                                         AS revenue,
      COALESCE(SUM(ic.cogs), 0)::float                                         AS cogs,
      COALESCE(SUM(s.total) - SUM(ic.cogs), 0)::float                          AS gross_profit,
      COALESCE(SUM(s.discount), 0)::float                                      AS total_discount,
      CASE
        WHEN SUM(s.total) > 0
        THEN ROUND(100.0 * (SUM(s.total) - SUM(ic.cogs)) / SUM(s.total), 1)::float
        ELSE 0
      END                                                                       AS margin_pct,
      COUNT(DISTINCT s.id)::int                                                AS total_sales
    FROM sales s
    LEFT JOIN item_costs ic ON ic.sale_id = s.id
    WHERE s.org_id = ${orgId}
      AND s.status  = 'COMPLETED'
      AND s.sold_at >= ${from}::date
      AND s.sold_at <  (${to}::date + INTERVAL '1 day')
  `;
  return summary as unknown as ProfitSummary;
}

export async function getProfitByMonth(
  sql: Sql, orgId: number, from: string, to: string
): Promise<ProfitByMonth[]> {
  const rows = await sql`
    WITH item_costs AS (
      SELECT sale_id, SUM(unit_cost * quantity) AS cogs
      FROM sale_items
      WHERE org_id = ${orgId}
      GROUP BY sale_id
    )
    SELECT
      TO_CHAR(s.sold_at, 'YYYY-MM')                                           AS month,
      TO_CHAR(s.sold_at, 'Mon YYYY')                                          AS month_label,
      COALESCE(SUM(s.total), 0)::float                                        AS revenue,
      COALESCE(SUM(ic.cogs), 0)::float                                        AS cogs,
      COALESCE(SUM(s.total) - SUM(ic.cogs), 0)::float                         AS profit,
      COUNT(DISTINCT s.id)::int                                               AS sales_count
    FROM sales s
    LEFT JOIN item_costs ic ON ic.sale_id = s.id
    WHERE s.org_id = ${orgId}
      AND s.status  = 'COMPLETED'
      AND s.sold_at >= ${from}::date
      AND s.sold_at <  (${to}::date + INTERVAL '1 day')
    GROUP BY TO_CHAR(s.sold_at, 'YYYY-MM'), TO_CHAR(s.sold_at, 'Mon YYYY')
    ORDER BY month
  `;
  return rows as unknown as ProfitByMonth[];
}

export async function getProfitByProduct(
  sql: Sql, orgId: number, from: string, to: string, limit = PROFIT_BY_PRODUCT_LIMIT
): Promise<ProfitByProduct[]> {
  const rows = await sql`
    SELECT
      p.name                                                                   AS product_name,
      COALESCE(p.sku, '')                                                      AS sku,
      SUM(si.quantity)::int                                                    AS qty_sold,
      COALESCE(SUM(si.line_total), 0)::float                                  AS revenue,
      COALESCE(SUM(si.unit_cost * si.quantity), 0)::float                    AS cogs,
      COALESCE(SUM(si.line_total - si.unit_cost * si.quantity), 0)::float    AS profit,
      CASE
        WHEN SUM(si.line_total) > 0
        THEN ROUND(100.0 * SUM(si.line_total - si.unit_cost * si.quantity) / SUM(si.line_total), 1)::float
        ELSE 0
      END AS margin_pct
    FROM sale_items si
    JOIN products p ON p.id = si.product_id
    JOIN sales    s ON s.id = si.sale_id
    WHERE si.org_id = ${orgId}
      AND s.status   = 'COMPLETED'
      AND s.sold_at  >= ${from}::date
      AND s.sold_at  <  (${to}::date + INTERVAL '1 day')
    GROUP BY p.id, p.name, p.sku
    ORDER BY profit DESC
    LIMIT ${limit}
  `;
  return rows as unknown as ProfitByProduct[];
}

// Gastos operativos del período: excluye compras de inventario/insumos y
// pagos de tarjeta (§7.2) — esos ya están contados como COGS o son traslado
// de deuda, no gasto del período.
export async function getOperatingExpenses(
  sql: Sql, orgId: number, from: string, to: string
): Promise<{ total_expenses: number }> {
  const [expenses] = await sql`
    SELECT COALESCE(SUM(amount), 0)::float AS total_expenses
    FROM transactions
    WHERE org_id      = ${orgId}
      AND type        = 'EXPENSE'
      AND (reference_type IS NULL OR reference_type NOT IN (${sql.unsafe(NON_OPERATING_REF_TYPES_SQL_LIST)}))
      AND occurred_at >= ${from}::date
      AND occurred_at <  (${to}::date + INTERVAL '1 day')
  `;
  return expenses as unknown as { total_expenses: number };
}

// ── Eventos ──────────────────────────────────────────────────────────────

export async function getEventRows(
  sql: Sql, orgId: number, from: string, to: string
): Promise<EventRow[]> {
  const rows = await sql`
    WITH item_costs AS (
      SELECT sale_id, SUM(unit_cost * quantity) AS cogs
      FROM sale_items
      WHERE org_id = ${orgId}
      GROUP BY sale_id
    ),
    sale_agg AS (
      SELECT
        s.event_id,
        COUNT(*)::int                     AS sales_count,
        SUM(s.total)                      AS total_revenue,
        SUM(COALESCE(ic.cogs, 0))         AS total_cogs
      FROM sales s
      LEFT JOIN item_costs ic ON ic.sale_id = s.id
      WHERE s.org_id = ${orgId}
        AND s.status  = 'COMPLETED'
        AND s.event_id IS NOT NULL
      GROUP BY s.event_id
    )
    SELECT
      e.id,
      e.name,
      COALESCE(e.location, '')                                               AS location,
      e.starts_at::text,
      e.ends_at::text,
      COALESCE(e.fixed_cost, 0)::float                                       AS fixed_cost,
      COALESCE(e.notes, '')                                                  AS notes,

      COALESCE(sa.sales_count, 0)::int                                       AS sales_count,
      COALESCE(sa.total_revenue, 0)::float                                   AS total_revenue,
      COALESCE(sa.total_cogs, 0)::float                                      AS total_cogs,

      COALESCE((
        SELECT SUM(t.amount)
        FROM transactions t
        WHERE t.reference_type = 'EVENT'
          AND t.reference_id   = e.id
          AND t.type           = 'EXPENSE'
          AND t.org_id         = e.org_id
      ), 0)::float AS extra_expenses,

      (
        COALESCE(sa.total_revenue, 0)
          - COALESCE(sa.total_cogs, 0)
          - COALESCE(e.fixed_cost, 0)
          - COALESCE((
              SELECT SUM(t.amount)
              FROM transactions t
              WHERE t.reference_type = 'EVENT'
                AND t.reference_id   = e.id
                AND t.type           = 'EXPENSE'
                AND t.org_id         = e.org_id
            ), 0)
      )::float AS net_profit,

      CASE
        WHEN NOW() < e.starts_at                        THEN 'PLANNED'
        WHEN NOW() BETWEEN e.starts_at AND e.ends_at    THEN 'ONGOING'
        ELSE                                                  'COMPLETED'
      END AS status

    FROM events e
    LEFT JOIN sale_agg sa ON sa.event_id = e.id
    WHERE e.org_id      = ${orgId}
      AND e.starts_at  >= ${from}::date
      AND e.starts_at  <  (${to}::date + INTERVAL '1 day')
    ORDER BY e.starts_at DESC
  `;
  return rows as unknown as EventRow[];
}

// ── Inventario ───────────────────────────────────────────────────────────

export async function getInventoryProducts(
  sql: Sql, orgId: number
): Promise<InventoryProduct[]> {
  const rows = await sql`
    SELECT
      p.id,
      p.name,
      COALESCE(p.sku, '')                                                    AS sku,
      p.price::float,
      COALESCE(SUM(ib.qty_available), 0)::int                               AS stock,
      CASE
        WHEN COALESCE(SUM(ib.qty_available), 0) > 0
        THEN (SUM(ib.qty_available * ib.unit_cost) / SUM(ib.qty_available))::float
        ELSE 0
      END                                                                    AS avg_cost,
      COALESCE(SUM(ib.qty_available * ib.unit_cost), 0)::float             AS stock_value,
      CASE
        WHEN p.price > 0 AND COALESCE(SUM(ib.qty_available), 0) > 0
        THEN ROUND(100.0 * (p.price - SUM(ib.qty_available * ib.unit_cost) / SUM(ib.qty_available)) / p.price, 1)::float
        ELSE null
      END                                                                    AS margin_pct
    FROM products p
    LEFT JOIN inventory_batches ib ON ib.product_id = p.id AND ib.org_id = p.org_id
    WHERE p.org_id = ${orgId}
      AND p.is_active   = TRUE
      AND p.is_service  = FALSE
    GROUP BY p.id, p.name, p.sku, p.price
    ORDER BY stock_value DESC
  `;
  return rows as unknown as InventoryProduct[];
}

export async function getInventoryMovements(
  sql: Sql, orgId: number, days = INVENTORY_MOVEMENTS_DAYS, limit = INVENTORY_MOVEMENTS_LIMIT
): Promise<InventoryMovement[]> {
  const rows = await sql`
    SELECT
      im.created_at::text,
      im.movement_type,
      p.name                    AS product_name,
      COALESCE(p.sku, '')       AS sku,
      im.quantity::int,
      im.reference_type,
      im.notes
    FROM inventory_movements im
    JOIN products p ON p.id = im.product_id
    WHERE im.org_id     = ${orgId}
      AND im.created_at >= NOW() - (${days}::text || ' days')::interval
    ORDER BY im.created_at DESC
    LIMIT ${limit}
  `;
  return rows as unknown as InventoryMovement[];
}

export function computeInventorySummary(
  products: InventoryProduct[], lowStockThreshold: number
): InventorySummary {
  return {
    total_products:    products.length,
    total_stock:       products.reduce((a, p) => a + Number(p.stock), 0),
    total_stock_value: products.reduce((a, p) => a + Number(p.stock_value), 0),
    low_stock_count:   products.filter(p => Number(p.stock) > 0 && Number(p.stock) <= lowStockThreshold).length,
    zero_stock_count:  products.filter(p => Number(p.stock) === 0).length,
  };
}
