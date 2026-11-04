// app/api/dashboard/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireFeature, requireModule, getModulePermissions } from "@/lib/auth";
import { addCalendarDays, todayInTimeZone, type CalendarDate } from "@/lib/date-utils";
import { calendarDateStartToUtc } from "@/lib/date-bounds";

const sql = neon(process.env.DATABASE_URL!);

function monthStart(year: number, month: number): CalendarDate {
  return `${year}-${String(month).padStart(2, "0")}-01` as CalendarDate;
}

function shiftMonth(year: number, month: number, amount: number): CalendarDate {
  const index = year * 12 + (month - 1) + amount;
  return monthStart(Math.floor(index / 12), (index % 12 + 12) % 12 + 1);
}

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'DASHBOARD', 'canView');
  if (deny) return deny;
  const creditCardsFeature = await requireFeature(auth.data.orgId, "finances.credit_cards");
  if (creditCardsFeature && creditCardsFeature.status >= 500) return creditCardsFeature;
  const canUseCreditCards = creditCardsFeature === null;

  // Permisos atómicos del rol: si no puede ver costos/ganancias,
  // esos campos se envían en null (el cliente ya oculta las columnas)
  const { showCosts, showProfit } = await getModulePermissions(auth.data, 'DASHBOARD');

  try {
    const { orgId, timezone } = auth.data;
    const { searchParams } = new URL(request.url);

    const today = todayInTimeZone(timezone);
    const [currentYear, currentMonth] = today.split("-").map(Number);
    const paramMonth  = searchParams.get("month");
    const paramYear   = searchParams.get("year");
    const isToday     = searchParams.get("period") === "today";

    const filterAll = !paramMonth && !paramYear && !isToday;
    const filterYear = paramYear ? Number(paramYear) : currentYear;
    const filterMonth = paramMonth ? Number(paramMonth) : currentMonth;

    let startISO: string;
    let endISO: string;
    let prevStartISO: string;
    let prevEndISO: string;

    if (isToday) {
      startISO = today;
      endISO = addCalendarDays(today, 1);
      prevStartISO = addCalendarDays(today, -1);
      prevEndISO = today;
    } else if (filterAll) {
      startISO = monthStart(currentYear, currentMonth);
      endISO = shiftMonth(currentYear, currentMonth, 1);
      prevStartISO = shiftMonth(currentYear, currentMonth, -1);
      prevEndISO = startISO;
    } else if (paramYear && !paramMonth) {
      startISO = monthStart(filterYear, 1);
      endISO = monthStart(filterYear + 1, 1);
      prevStartISO = monthStart(filterYear - 1, 1);
      prevEndISO = startISO;
    } else {
      startISO = monthStart(filterYear, filterMonth);
      endISO = shiftMonth(filterYear, filterMonth, 1);
      prevStartISO = shiftMonth(filterYear, filterMonth, -1);
      prevEndISO = startISO;
    }

    const startInstant = calendarDateStartToUtc(startISO, timezone).toISOString();
    const endInstant = calendarDateStartToUtc(endISO, timezone).toISOString();

    // Las consultas del dashboard se agrupan por dominio para evitar viajes
    // repetidos a Neon. Los tres bloques son independientes y se ejecutan en
    // paralelo; dentro de cada uno, los CTE reutilizan el conjunto filtrado.
    const topProductsLimit = isToday ? null : 5;
    const [summaryRows, analyticsRows, inventoryRows] = await Promise.all([
      sql`
        WITH sales_metrics AS (
          SELECT
            COALESCE(SUM(total) FILTER (
              WHERE sale_date >= ${startISO}::date AND sale_date < ${endISO}::date
            ), 0) AS revenue_this,
            COALESCE(SUM(total) FILTER (
              WHERE sale_date >= ${prevStartISO}::date AND sale_date < ${prevEndISO}::date
            ), 0) AS revenue_last,
            COUNT(*) FILTER (
              WHERE sale_date >= ${startISO}::date AND sale_date < ${endISO}::date
            )::int AS sales_count
          FROM sales
          WHERE org_id = ${orgId}
            AND status = 'COMPLETED'
            AND sale_date >= ${prevStartISO}::date
            AND sale_date < ${endISO}::date
        ),
        profit_metrics AS (
          SELECT
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
            ) FILTER (
              WHERE s.sale_date >= ${startISO}::date AND s.sale_date < ${endISO}::date
            ), 0)
            - COALESCE((
                SELECT SUM(ss.line_total)
                FROM sale_supplies ss
                JOIN sales s2 ON s2.id = ss.sale_id AND s2.org_id = ss.org_id
                WHERE ss.org_id = ${orgId}
                  AND ss.deleted_at IS NULL
                  AND s2.status = 'COMPLETED'
                  AND s2.sale_date >= ${startISO}::date AND s2.sale_date < ${endISO}::date
              ), 0) AS profit_this,
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
            ) FILTER (
              WHERE s.sale_date >= ${prevStartISO}::date AND s.sale_date < ${prevEndISO}::date
            ), 0)
            - COALESCE((
                SELECT SUM(ss.line_total)
                FROM sale_supplies ss
                JOIN sales s2 ON s2.id = ss.sale_id AND s2.org_id = ss.org_id
                WHERE ss.org_id = ${orgId}
                  AND ss.deleted_at IS NULL
                  AND s2.status = 'COMPLETED'
                  AND s2.sale_date >= ${prevStartISO}::date AND s2.sale_date < ${prevEndISO}::date
              ), 0) AS profit_last
          FROM sales s
          JOIN sale_items si ON si.sale_id = s.id AND si.org_id = s.org_id
          WHERE s.org_id = ${orgId}
            AND s.status = 'COMPLETED'
            AND s.sale_date >= ${prevStartISO}::date
            AND s.sale_date < ${endISO}::date
        ),
        customer_metrics AS (
          SELECT
            COUNT(*)::int AS customers_total,
            COUNT(*) FILTER (
              WHERE created_at >= ${startInstant}::timestamptz AND created_at < ${endInstant}::timestamptz
            )::int AS customers_new
          FROM customers
          WHERE org_id = ${orgId}
        )
        SELECT
          sm.revenue_this,
          sm.revenue_last,
          sm.sales_count,
          pm.profit_this,
          pm.profit_last,
          cm.customers_total,
          cm.customers_new,
          (
            SELECT COALESCE(SUM(balance), 0)
            FROM accounts
            WHERE org_id = ${orgId} AND is_active = TRUE
          ) AS accounts_balance,
          ${canUseCreditCards
            ? sql`(
                SELECT COALESCE(SUM(balance), 0)
                FROM credit_cards
                WHERE org_id = ${orgId} AND is_active = TRUE
              )`
            : sql`NULL`} AS credit_card_debt_local,
          ${canUseCreditCards
            ? sql`(
                SELECT COALESCE(SUM(balance_usd), 0)
                FROM credit_cards
                WHERE org_id = ${orgId} AND is_active = TRUE
              )`
            : sql`NULL`} AS credit_card_debt_usd,
          (
            SELECT COALESCE(jsonb_agg(
              jsonb_build_object('year', periods.year, 'month', periods.month)
              ORDER BY periods.year DESC, periods.month DESC
            ), '[]'::jsonb)
            FROM (
              SELECT DISTINCT
                EXTRACT(YEAR FROM sale_date)::int AS year,
                EXTRACT(MONTH FROM sale_date)::int AS month
              FROM sales
              WHERE org_id = ${orgId}
            ) periods
          ) AS available_periods
        FROM sales_metrics sm
        CROSS JOIN profit_metrics pm
        CROSS JOIN customer_metrics cm
      `,
      sql`
        WITH filtered_sales AS MATERIALIZED (
          SELECT
            id, sale_number, customer_id, total, payment_method, sale_date, sold_at,
            subtotal, discount, tax, org_id
          FROM sales
          WHERE org_id = ${orgId}
            AND status = 'COMPLETED'
            AND sale_date >= ${startISO}::date
            AND sale_date < ${endISO}::date
        ),
        sales_with_profit AS MATERIALIZED (
          SELECT
            s.id,
            s.sale_number,
            s.customer_id,
            s.total,
            s.payment_method,
            s.sale_date,
            s.sold_at,
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
            ), 0)
            - COALESCE((
                SELECT SUM(ss.line_total)
                FROM sale_supplies ss
                WHERE ss.sale_id = s.id
                  AND ss.org_id = ${orgId}
                  AND ss.deleted_at IS NULL
              ), 0) AS profit
          FROM filtered_sales s
          LEFT JOIN sale_items si ON si.sale_id = s.id AND si.org_id = s.org_id
          GROUP BY
            s.id, s.sale_number, s.customer_id, s.total,
            s.payment_method, s.sale_date, s.sold_at
        ),
        top_products AS (
          SELECT
            p.id,
            p.name,
            p.image_url,
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
          FROM filtered_sales s
          JOIN sale_items si ON si.sale_id = s.id AND si.org_id = s.org_id
          JOIN products p ON p.id = si.product_id
          GROUP BY p.id
          ORDER BY units_sold DESC
          LIMIT ${topProductsLimit}
        )
        SELECT
          (
            SELECT COALESCE(jsonb_agg(
              jsonb_build_object(
                'date', daily.date,
                'revenue', daily.revenue,
                'profit', daily.profit
              ) ORDER BY daily.date
            ), '[]'::jsonb)
            FROM (
              SELECT
                sale_date::text AS date,
                COALESCE(SUM(total), 0) AS revenue,
                COALESCE(SUM(profit), 0) AS profit
              FROM sales_with_profit
              GROUP BY sale_date
            ) daily
          ) AS sales_chart,
          (
            SELECT COALESCE(jsonb_agg(
              jsonb_build_object(
                'method', methods.method,
                'amount', methods.amount
              ) ORDER BY methods.amount DESC
            ), '[]'::jsonb)
            FROM (
              SELECT
                COALESCE(payment_method, 'OTHER') AS method,
                COALESCE(SUM(total), 0) AS amount
              FROM sales_with_profit
              GROUP BY COALESCE(payment_method, 'OTHER')
            ) methods
          ) AS payment_methods,
          (
            SELECT COALESCE(jsonb_agg(
              jsonb_build_object(
                'id', id,
                'name', name,
                'image_url', image_url,
                'units_sold', units_sold,
                'revenue', revenue,
                'profit', profit
              ) ORDER BY units_sold DESC
            ), '[]'::jsonb)
            FROM top_products
          ) AS top_products,
          (
            SELECT COALESCE(jsonb_agg(
              jsonb_build_object(
                'id', recent.id,
                'sale_number', recent.sale_number,
                'total', recent.total,
                'payment_method', recent.payment_method,
                'sale_date', recent.sale_date,
                'sold_at', recent.sold_at,
                'customer_name', recent.customer_name,
                'items_count', recent.items_count,
                'profit', recent.profit
              ) ORDER BY recent.sale_date DESC, recent.id DESC
            ), '[]'::jsonb)
            FROM (
              SELECT swp.*, c.name AS customer_name
              FROM sales_with_profit swp
              LEFT JOIN customers c ON c.id = swp.customer_id
              ORDER BY swp.sale_date DESC, swp.id DESC
              LIMIT 5
            ) recent
          ) AS recent_sales
      `,
      sql`
        WITH product_stock AS MATERIALIZED (
          SELECT
            p.id,
            p.name,
            p.sku,
            p.image_url,
            COALESCE(SUM(ib.qty_available), 0)::int AS stock,
            COALESCE(SUM(ib.qty_available * ib.unit_cost), 0) AS stock_value
          FROM products p
          LEFT JOIN inventory_batches ib
            ON ib.product_id = p.id AND ib.org_id = p.org_id
          WHERE p.org_id = ${orgId}
            AND p.is_active = TRUE
            AND p.is_service = FALSE
          GROUP BY p.id
        )
        SELECT
          COUNT(*)::int AS total_products,
          COALESCE(SUM(stock), 0)::int AS total_units,
          COALESCE(SUM(stock_value), 0) AS total_value,
          COUNT(*) FILTER (WHERE stock = 0)::int AS out_of_stock,
          COUNT(*) FILTER (WHERE stock > 0 AND stock < 10)::int AS low_stock,
          (
            SELECT COALESCE(jsonb_agg(
              jsonb_build_object(
                'id', low.id,
                'name', low.name,
                'sku', low.sku,
                'image_url', low.image_url,
                'stock', low.stock
              ) ORDER BY low.stock ASC
            ), '[]'::jsonb)
            FROM (
              SELECT id, name, sku, image_url, stock
              FROM product_stock
              WHERE stock < 10
              ORDER BY stock ASC
              LIMIT 5
            ) low
          ) AS low_stock_items
        FROM product_stock
      `,
    ]);

    const summary = summaryRows[0];
    const analytics = analyticsRows[0];
    const inventoryStats = inventoryRows[0];
    const salesChart = Array.isArray(analytics?.sales_chart) ? analytics.sales_chart : [];
    const paymentMethods = Array.isArray(analytics?.payment_methods) ? analytics.payment_methods : [];
    const topProducts = Array.isArray(analytics?.top_products) ? analytics.top_products : [];
    const recentSales = Array.isArray(analytics?.recent_sales) ? analytics.recent_sales : [];
    const lowStock = Array.isArray(inventoryStats?.low_stock_items) ? inventoryStats.low_stock_items : [];

    const revenueThisNum = Number(summary?.revenue_this ?? 0);
    const revenueLastNum = Number(summary?.revenue_last ?? 0);
    const profitThisNum = Number(summary?.profit_this ?? 0);
    const profitLastNum = Number(summary?.profit_last ?? 0);

    return Response.json({
      data: {
        period: isToday
          ? "today" as const
          : filterAll ? null : { year: filterYear, month: paramMonth ? filterMonth : null },
        periods: Array.isArray(summary?.available_periods) ? summary.available_periods : [],
        metrics: {
          revenue: revenueThisNum,
          revenue_change: revenueLastNum > 0 ? ((revenueThisNum - revenueLastNum) / revenueLastNum) * 100 : null,
          profit: showProfit ? profitThisNum : null,
          profit_change: showProfit && profitLastNum > 0 ? ((profitThisNum - profitLastNum) / profitLastNum) * 100 : null,
          sales_count: Number(summary?.sales_count ?? 0),
          customers_total: Number(summary?.customers_total ?? 0),
          customers_new: Number(summary?.customers_new ?? 0),
          inventory: {
            total_products: Number(inventoryStats?.total_products ?? 0),
            total_units: Number(inventoryStats?.total_units ?? 0),
            total_value: showCosts ? Number(inventoryStats?.total_value ?? 0) : null,
            out_of_stock: Number(inventoryStats?.out_of_stock ?? 0),
            low_stock: Number(inventoryStats?.low_stock ?? 0),
          },
          balance: Number(summary?.accounts_balance ?? 0),
          credit_card_debt: {
            local: Number(summary?.credit_card_debt_local ?? 0),
            usd:   Number(summary?.credit_card_debt_usd   ?? 0),
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
          payment_method: r.payment_method ?? "OTHER", sale_date: String(r.sale_date), sold_at: String(r.sold_at),
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
