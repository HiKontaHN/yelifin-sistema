// app/api/dashboard/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule, getModulePermissions } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'DASHBOARD', 'canView');
  if (deny) return deny;

  // Permisos atómicos del rol: si no puede ver costos/ganancias,
  // esos campos se envían en null (el cliente ya oculta las columnas)
  const { showCosts, showProfit } = await getModulePermissions(auth.data, 'DASHBOARD');

  try {
    const { userId, orgId } = auth.data;
    const { searchParams } = new URL(request.url);

    const now = new Date();
    const paramMonth = searchParams.get("month");
    const paramYear = searchParams.get("year");

    const filterAll = !paramMonth && !paramYear;
    const filterYear = paramYear ? Number(paramYear) : now.getFullYear();
    const filterMonth = paramMonth ? Number(paramMonth) : now.getMonth() + 1;

    let startISO: string;
    let endISO: string;
    let prevStartISO: string;
    let prevEndISO: string;

    if (filterAll) {
      startISO = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      endISO = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
      prevStartISO = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      prevEndISO = startISO;
    } else if (paramYear && !paramMonth) {
      startISO = new Date(filterYear, 0, 1).toISOString();
      endISO = new Date(filterYear + 1, 0, 1).toISOString();
      prevStartISO = new Date(filterYear - 1, 0, 1).toISOString();
      prevEndISO = startISO;
    } else {
      startISO = new Date(filterYear, filterMonth - 1, 1).toISOString();
      endISO = new Date(filterYear, filterMonth, 1).toISOString();
      prevStartISO = new Date(filterYear, filterMonth - 2, 1).toISOString();
      prevEndISO = startISO;
    }

    // ── Revenue (solo COMPLETED) ───────────────────────────────────────
    const [revenueThis] = await sql`
      SELECT COALESCE(SUM(total), 0) AS revenue FROM sales
      WHERE org_id = ${orgId} AND status = 'COMPLETED'
        AND sold_at >= ${startISO} AND sold_at < ${endISO}
    `;
    const [revenueLast] = await sql`
      SELECT COALESCE(SUM(total), 0) AS revenue FROM sales
      WHERE org_id = ${orgId} AND status = 'COMPLETED'
        AND sold_at >= ${prevStartISO} AND sold_at < ${prevEndISO}
    `;
    const [countThis] = await sql`
      SELECT COUNT(*)::int AS count FROM sales
      WHERE org_id = ${orgId} AND status = 'COMPLETED'
        AND sold_at >= ${startISO} AND sold_at < ${endISO}
    `;

    // ── Profit (considerando descuentos y distribución proporcional del tax) ────
    const [profitThis] = await sql`
      SELECT COALESCE(SUM(
        si.line_total 
        - (si.unit_cost * si.quantity)
        - COALESCE(
            CASE 
              WHEN (s.subtotal - s.discount) > 0 
              THEN (s.tax * si.line_total / (s.subtotal - s.discount))
              ELSE 0
            END,
            0
          )
      ), 0) AS profit
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      WHERE si.org_id = ${orgId} AND s.status = 'COMPLETED'
        AND s.sold_at >= ${startISO} AND s.sold_at < ${endISO}
    `;

    const [profitLast] = await sql`
      SELECT COALESCE(SUM(
        si.line_total
        - (si.unit_cost * si.quantity)
        - COALESCE(
            CASE
              WHEN (s.subtotal - s.discount) > 0
              THEN (s.tax * si.line_total / (s.subtotal - s.discount))
              ELSE 0
            END,
            0
          )
      ), 0) AS profit
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      WHERE si.org_id = ${orgId} AND s.status = 'COMPLETED'
        AND s.sold_at >= ${prevStartISO} AND s.sold_at < ${prevEndISO}
    `;

    // ── Customers ──────────────────────────────────────────────────────
    const [customersTotal] = await sql`
      SELECT COUNT(*)::int AS count FROM customers WHERE org_id = ${orgId}
    `;
    const [customersNew] = await sql`
      SELECT COUNT(*)::int AS count FROM customers
      WHERE org_id = ${orgId} AND created_at >= ${startISO} AND created_at < ${endISO}
    `;

    // ── Inventory ──────────────────────────────────────────────────────
    const [inventoryStats] = await sql`
      SELECT
        COUNT(DISTINCT p.id)::int                          AS total_products,
        COALESCE(SUM(ib.qty_available), 0)::int           AS total_units,
        COALESCE(SUM(ib.qty_available * ib.unit_cost), 0) AS total_value,
        COUNT(DISTINCT CASE WHEN COALESCE(stock.s, 0) = 0 THEN p.id END)::int AS out_of_stock,
        COUNT(DISTINCT CASE WHEN COALESCE(stock.s, 0) > 0 AND COALESCE(stock.s, 0) < 10 THEN p.id END)::int AS low_stock
      FROM products p
      LEFT JOIN inventory_batches ib ON ib.product_id = p.id AND ib.org_id = p.org_id
      LEFT JOIN (
        SELECT product_id, SUM(qty_available) AS s
        FROM inventory_batches WHERE org_id = ${orgId} GROUP BY product_id
      ) stock ON stock.product_id = p.id
      WHERE p.org_id = ${orgId} AND p.is_active = TRUE
    `;

    // ── Balance ────────────────────────────────────────────────────────
    const [accountsBalance] = await sql`
      SELECT COALESCE(SUM(balance), 0) AS total
      FROM accounts WHERE org_id = ${orgId} AND is_active = TRUE
    `;

    // ── Deuda de tarjetas de crédito ───────────────────────────────────
    const [creditCardDebt] = await sql`
      SELECT
        COALESCE(SUM(balance),     0) AS total_local,
        COALESCE(SUM(balance_usd), 0) AS total_usd
      FROM credit_cards
      WHERE org_id = ${orgId} AND is_active = TRUE
    `;

    // ── Sales chart (con cálculo correcto de profit) ───────────────────────
    const salesChart = await sql`
  WITH daily_revenue AS (
    SELECT
      DATE(sold_at)::text AS date,
      COALESCE(SUM(total), 0) AS revenue
    FROM sales
    WHERE org_id = ${orgId} AND status = 'COMPLETED'
      AND sold_at >= ${startISO} AND sold_at < ${endISO}
    GROUP BY DATE(sold_at)
  ),
  daily_profit AS (
    SELECT
      DATE(s.sold_at)::text AS date,
      COALESCE(SUM(
        si.line_total
        - (si.unit_cost * si.quantity)
        - COALESCE(
            CASE
              WHEN (s.subtotal - s.discount) > 0
              THEN (s.tax * si.line_total / (s.subtotal - s.discount))
              ELSE 0
            END,
            0
          )
      ), 0) AS profit
    FROM sales s
    LEFT JOIN sale_items si ON si.sale_id = s.id AND si.org_id = s.org_id
    WHERE s.org_id = ${orgId} AND s.status = 'COMPLETED'
      AND s.sold_at >= ${startISO} AND s.sold_at < ${endISO}
    GROUP BY DATE(s.sold_at)
  )
  SELECT
    COALESCE(dr.date, dp.date) AS date,
    COALESCE(dr.revenue, 0) AS revenue,
    COALESCE(dp.profit, 0) AS profit
  FROM daily_revenue dr
  FULL OUTER JOIN daily_profit dp ON dr.date = dp.date
  ORDER BY date ASC
`;

    // ── Payment methods (solo COMPLETED) ──────────────────────────────
    const paymentMethods = await sql`
      SELECT
        COALESCE(payment_method, 'OTHER') AS method,
        COALESCE(SUM(total), 0)           AS amount
      FROM sales
      WHERE org_id = ${orgId} AND status = 'COMPLETED'
        AND sold_at >= ${startISO} AND sold_at < ${endISO}
      GROUP BY COALESCE(payment_method, 'OTHER')
      ORDER BY amount DESC
    `;

    // ── Top 5 productos (con cálculo correcto de profit) ──────────────
    const topProducts = await sql`
      SELECT
        p.id, p.name, p.image_url,
        SUM(si.quantity)::int AS units_sold,
        COALESCE(SUM(si.line_total), 0) AS revenue,
        COALESCE(SUM(
          si.line_total 
          - (si.unit_cost * si.quantity)
          - COALESCE(
              CASE 
                WHEN (s.subtotal - s.discount) > 0 
                THEN (s.tax * si.line_total / (s.subtotal - s.discount))
                ELSE 0
              END,
              0
            )
        ), 0) AS profit
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id AND s.org_id = si.org_id
      JOIN products p ON p.id = si.product_id
      WHERE si.org_id = ${orgId} AND s.status = 'COMPLETED'
        AND s.sold_at >= ${startISO} AND s.sold_at < ${endISO}
      GROUP BY p.id
      ORDER BY units_sold DESC
      LIMIT 5
    `;

    // ── Últimas 5 ventas (con cálculo correcto de profit) ─────────────
    const recentSales = await sql`
      SELECT
        s.id, s.sale_number, s.total, s.payment_method, s.sold_at,
        c.name AS customer_name,
        COUNT(si.id)::int AS items_count,
        COALESCE(SUM(
          si.line_total 
          - (si.unit_cost * si.quantity)
          - COALESCE(
              CASE 
                WHEN (s.subtotal - s.discount) > 0 
                THEN (s.tax * si.line_total / (s.subtotal - s.discount))
                ELSE 0
              END,
              0
            )
        ), 0) AS profit
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN sale_items si ON si.sale_id = s.id AND si.org_id = s.org_id
      WHERE s.org_id = ${orgId} AND s.status = 'COMPLETED'
        AND s.sold_at >= ${startISO} AND s.sold_at < ${endISO}
      GROUP BY s.id, c.name
      ORDER BY s.sold_at DESC
      LIMIT 5
    `;

    // ── Low stock ──────────────────────────────────────────────────────
    const lowStock = await sql`
      SELECT
        p.id, p.name, p.sku, p.image_url,
        COALESCE(SUM(ib.qty_available), 0)::int AS stock
      FROM products p
      LEFT JOIN inventory_batches ib ON ib.product_id = p.id AND ib.org_id = p.org_id
      WHERE p.org_id = ${orgId} AND p.is_active = TRUE AND p.is_service = FALSE
      GROUP BY p.id
      HAVING COALESCE(SUM(ib.qty_available), 0) < 10
      ORDER BY stock ASC
      LIMIT 5
    `;

    const revenueThisNum = Number(revenueThis?.revenue ?? 0);
    const revenueLastNum = Number(revenueLast?.revenue ?? 0);
    const profitThisNum = Number(profitThis?.profit ?? 0);
    const profitLastNum = Number(profitLast?.profit ?? 0);

    return Response.json({
      data: {
        period: filterAll ? null : { year: filterYear, month: paramMonth ? filterMonth : null },
        metrics: {
          revenue: revenueThisNum,
          revenue_change: revenueLastNum > 0 ? ((revenueThisNum - revenueLastNum) / revenueLastNum) * 100 : null,
          profit: showProfit ? profitThisNum : null,
          profit_change: showProfit && profitLastNum > 0 ? ((profitThisNum - profitLastNum) / profitLastNum) * 100 : null,
          sales_count: Number(countThis?.count ?? 0),
          customers_total: Number(customersTotal?.count ?? 0),
          customers_new: Number(customersNew?.count ?? 0),
          inventory: {
            total_products: Number(inventoryStats?.total_products ?? 0),
            total_units: Number(inventoryStats?.total_units ?? 0),
            total_value: showCosts ? Number(inventoryStats?.total_value ?? 0) : null,
            out_of_stock: Number(inventoryStats?.out_of_stock ?? 0),
            low_stock: Number(inventoryStats?.low_stock ?? 0),
          },
          balance: Number(accountsBalance?.total ?? 0),
          credit_card_debt: {
            local: Number(creditCardDebt?.total_local ?? 0),
            usd:   Number(creditCardDebt?.total_usd   ?? 0),
          },
        },
        sales_chart: salesChart.map((r: any) => ({ date: r.date, revenue: Number(r.revenue), profit: showProfit ? Number(r.profit) : null })),
        payment_methods: paymentMethods.map((r: any) => ({ method: String(r.method), amount: Number(r.amount) })),
        top_products: topProducts.map((r: any) => ({
          id: Number(r.id), name: String(r.name), image_url: r.image_url ?? null,
          units_sold: Number(r.units_sold), revenue: Number(r.revenue), profit: showProfit ? Number(r.profit) : null,
        })),
        recent_sales: recentSales.map((r: any) => ({
          id: Number(r.id), sale_number: String(r.sale_number), total: Number(r.total),
          payment_method: r.payment_method ?? "OTHER", sold_at: String(r.sold_at),
          customer_name: r.customer_name ?? null, items_count: Number(r.items_count), profit: showProfit ? Number(r.profit) : null,
        })),
        low_stock: lowStock.map((r: any) => ({
          id: Number(r.id), name: String(r.name), sku: r.sku ?? null,
          image_url: r.image_url ?? null, stock: Number(r.stock),
        })),
      },
    });
  } catch (error) {
    console.error(" GET /api/dashboard:", error);
    return createErrorResponse("Error al obtener datos del dashboard", 500);
  }
}