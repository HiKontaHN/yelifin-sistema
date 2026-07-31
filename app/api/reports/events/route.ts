// app/api/reports/events/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule, requireFeature, getModulePermissions, nullifyKeysDeep } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);

function defaultRange() {
  const now  = new Date();
  const from = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
  const to   = new Date(now.getFullYear(), 11, 31).toISOString().slice(0, 10);
  return { from, to };
}

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'REPORTS', 'canView');
  if (deny) return deny;
  const denyFeature = await requireFeature(auth.data.orgId, 'reports.events');
  if (denyFeature) return denyFeature;

  try {
    const { userId, orgId } = auth.data;
    const { searchParams } = new URL(request.url);
    const def  = defaultRange();
    const from = searchParams.get("from") ?? def.from;
    const to   = searchParams.get("to")   ?? def.to;

    // ── Eventos con sus métricas ───────────────────────────────────
    const events = await sql`
      SELECT
        e.id,
        e.name,
        COALESCE(e.location, '')                                               AS location,
        e.starts_at::text,
        e.ends_at::text,
        COALESCE(e.fixed_cost, 0)::float                                       AS fixed_cost,
        COALESCE(e.notes, '')                                                  AS notes,

        -- Ventas del evento
        COUNT(DISTINCT s.id)::int                                              AS sales_count,
        COALESCE(SUM(s.total), 0)::float                                       AS total_revenue,
        COALESCE(SUM(si.unit_cost * si.quantity), 0)::float                   AS total_cogs,

        -- Gastos adicionales del evento
        COALESCE((
          SELECT SUM(t.amount)
          FROM transactions t
          WHERE t.reference_type = 'EVENT'
            AND t.reference_id   = e.id
            AND t.type           = 'EXPENSE'
            AND t.org_id         = e.org_id
        ), 0)::float AS extra_expenses,

        -- Utilidad neta
        COALESCE(SUM(s.total), 0)
          - COALESCE(SUM(si.unit_cost * si.quantity), 0)
          - COALESCE(e.fixed_cost, 0)
          - COALESCE((
              SELECT SUM(t.amount)
              FROM transactions t
              WHERE t.reference_type = 'EVENT'
                AND t.reference_id   = e.id
                AND t.type           = 'EXPENSE'
                AND t.org_id         = e.org_id
            ), 0) AS net_profit,

        CASE
          WHEN NOW() < e.starts_at                        THEN 'PLANNED'
          WHEN NOW() BETWEEN e.starts_at AND e.ends_at    THEN 'ONGOING'
          ELSE                                                  'COMPLETED'
        END AS status

      FROM events e
      LEFT JOIN sales      s  ON s.event_id  = e.id AND s.status = 'COMPLETED' AND s.org_id = e.org_id
      LEFT JOIN sale_items si ON si.sale_id  = s.id AND si.org_id = e.org_id
      WHERE e.org_id      = ${orgId}
        AND e.starts_at  >= ${from}::date
        AND e.starts_at  <  (${to}::date + INTERVAL '1 day')
      GROUP BY e.id, e.name, e.location, e.starts_at, e.ends_at, e.fixed_cost, e.notes, e.org_id
      ORDER BY e.starts_at DESC
    `;

    // ── Resumen global ─────────────────────────────────────────────
    const totalEvents   = events.length;
    const totalRevenue  = events.reduce((a: number, e: any) => a + Number(e.total_revenue), 0);
    const totalCogs     = events.reduce((a: number, e: any) => a + Number(e.total_cogs), 0);
    const totalExpenses = events.reduce((a: number, e: any) => a + Number(e.fixed_cost) + Number(e.extra_expenses), 0);
    const totalProfit   = events.reduce((a: number, e: any) => a + Number(e.net_profit), 0);
    const totalSales    = events.reduce((a: number, e: any) => a + Number(e.sales_count), 0);

    const summary = {
      total_events:   totalEvents,
      total_revenue:  totalRevenue,
      total_cogs:     totalCogs,
      total_expenses: totalExpenses,
      gross_profit:   totalRevenue - totalCogs,
      net_profit:     totalProfit,
      total_sales:    totalSales,
    };

    // Permisos atómicos del rol: anular costos/ganancias si no puede verlos
    const perms = await getModulePermissions(auth.data, 'REPORTS');
    const payload = { summary, events, from, to };
    if (!perms.showCosts)  nullifyKeysDeep(payload, new Set(["total_cogs"]));
    if (!perms.showProfit) nullifyKeysDeep(payload, new Set(["gross_profit", "net_profit"]));

    return Response.json(payload);
  } catch (error) {
    console.error("GET /api/reports/events:", error);
    return createErrorResponse("Error al generar reporte de eventos", 500);
  }
}
