// app/api/reports/profit/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule, requireFeature, getModulePermissions, nullifyKeysDeep } from "@/lib/auth";
import { defaultYearRange, getProfitSummary, getProfitByMonth, getProfitByProduct, getOperatingExpenses } from "@/lib/reports/queries";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'REPORTS', 'canView');
  if (deny) return deny;
  const denyFeature = await requireFeature(auth.data.orgId, 'reports.profit');
  if (denyFeature) return denyFeature;

  // Este reporte es 100% costos/ganancias — requiere el permiso atómico
  const perms = await getModulePermissions(auth.data, 'REPORTS');
  if (!perms.showProfit) {
    return createErrorResponse("Tu rol no tiene permiso para ver ganancias", 403);
  }

  try {
    const { orgId } = auth.data;
    const { searchParams } = new URL(request.url);
    const def  = defaultYearRange();
    const from = searchParams.get("from") ?? def.from;
    const to   = searchParams.get("to")   ?? def.to;

    const [summary, byMonth, byProduct, expenses] = await Promise.all([
      getProfitSummary(sql, orgId, from, to),
      getProfitByMonth(sql, orgId, from, to),
      getProfitByProduct(sql, orgId, from, to),
      getOperatingExpenses(sql, orgId, from, to),
    ]);

    // Permiso atómico de costos: aunque el rol vea ganancias, puede no ver
    // el detalle de costo que las compone (a diferencia de las otras rutas,
    // aquí antes no se filtraba — ver context-modules/reports.md §7.4).
    const payload = { summary, byMonth, byProduct, expenses, from, to };
    if (!perms.showCosts) nullifyKeysDeep(payload, new Set(["cogs"]));

    return Response.json(payload);
  } catch (error) {
    console.error("GET /api/reports/profit:", error);
    return createErrorResponse("Error al generar reporte de rentabilidad", 500);
  }
}
