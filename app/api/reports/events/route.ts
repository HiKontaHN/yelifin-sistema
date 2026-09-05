// app/api/reports/events/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule, requireFeature, getModulePermissions, nullifyKeysDeep } from "@/lib/auth";
import { defaultYearRange, getEventRows } from "@/lib/reports/queries";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'REPORTS', 'canView', 'EVENTS');
  if (deny) return deny;
  const denyFeature = await requireFeature(auth.data.orgId, 'reports.events');
  if (denyFeature) return denyFeature;

  try {
    const { orgId } = auth.data;
    const { searchParams } = new URL(request.url);
    const def  = defaultYearRange();
    const from = searchParams.get("from") ?? def.from;
    const to   = searchParams.get("to")   ?? def.to;

    const events = await getEventRows(sql, orgId, from, to);

    // ── Resumen global ─────────────────────────────────────────────
    const totalRevenue  = events.reduce((a, e) => a + Number(e.total_revenue), 0);
    const totalCogs     = events.reduce((a, e) => a + Number(e.total_cogs), 0);
    const totalExpenses = events.reduce((a, e) => a + Number(e.fixed_cost) + Number(e.extra_expenses), 0);
    const totalProfit   = events.reduce((a, e) => a + Number(e.net_profit), 0);
    const totalSales    = events.reduce((a, e) => a + Number(e.sales_count), 0);

    const summary = {
      total_events:   events.length,
      total_revenue:  totalRevenue,
      total_cogs:     totalCogs,
      total_expenses: totalExpenses,
      gross_profit:   totalRevenue - totalCogs,
      net_profit:     totalProfit,
      total_sales:    totalSales,
    };

    // Permisos atómicos del rol: anular costos/ganancias si no puede verlos
    const perms = await getModulePermissions(auth.data, 'REPORTS', 'EVENTS');
    const payload = { summary, events, from, to };
    if (!perms.showCosts)  nullifyKeysDeep(payload, new Set(["total_cogs"]));
    if (!perms.showProfit) nullifyKeysDeep(payload, new Set(["gross_profit", "net_profit"]));

    return Response.json(payload);
  } catch (error) {
    console.error("GET /api/reports/events:", error);
    return createErrorResponse("Error al generar reporte de eventos", 500);
  }
}
