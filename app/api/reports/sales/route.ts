// app/api/reports/sales/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule, requireFeature, getModulePermissions, nullifyKeysDeep } from "@/lib/auth";
import { defaultMonthRange, getSalesSummary, getSalesByDay, getSalesByProduct, getSalesDetail } from "@/lib/reports/queries";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'REPORTS', 'canView');
  if (deny) return deny;
  const denyFeature = await requireFeature(auth.data.orgId, 'reports.sales');
  if (denyFeature) return denyFeature;

  try {
    const { orgId } = auth.data;
    const { searchParams } = new URL(request.url);
    const def  = defaultMonthRange();
    const from = searchParams.get("from") ?? def.from;
    const to   = searchParams.get("to")   ?? def.to;

    const [summary, byDay, byProduct, detail] = await Promise.all([
      getSalesSummary(sql, orgId, from, to),
      getSalesByDay(sql, orgId, from, to),
      getSalesByProduct(sql, orgId, from, to),
      getSalesDetail(sql, orgId, from, to),
    ]);

    // Permisos atómicos del rol: anular costos/ganancias si no puede verlos
    const perms = await getModulePermissions(auth.data, 'REPORTS');
    const payload = { summary, byDay, byProduct, detail, from, to };
    if (!perms.showCosts)  nullifyKeysDeep(payload, new Set(["cogs"]));
    if (!perms.showProfit) nullifyKeysDeep(payload, new Set(["profit", "gross_profit", "margin_pct"]));

    return Response.json(payload);
  } catch (error) {
    console.error("GET /api/reports/sales:", error);
    return createErrorResponse("Error al generar reporte de ventas", 500);
  }
}
