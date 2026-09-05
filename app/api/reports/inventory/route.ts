// app/api/reports/inventory/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule, requireFeature, getModulePermissions, nullifyKeysDeep } from "@/lib/auth";
import { getInventoryProducts, getInventoryMovements, computeInventorySummary, getInventorySalesVelocity, computeInventoryVelocity, getInventoryTurnover } from "@/lib/reports/queries";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'REPORTS', 'canView', 'INVENTORY');
  if (deny) return deny;
  const denyFeature = await requireFeature(auth.data.orgId, 'reports.inventory');
  if (denyFeature) return denyFeature;

  try {
    const { orgId } = auth.data;
    const { searchParams } = new URL(request.url);
    const lowStockThreshold = Number(searchParams.get("low_stock") ?? "5") || 5;

    const [products, movements, velocityRows, turnover] = await Promise.all([
      getInventoryProducts(sql, orgId),
      getInventoryMovements(sql, orgId),
      getInventorySalesVelocity(sql, orgId),
      getInventoryTurnover(sql, orgId),
    ]);

    const summary  = computeInventorySummary(products, lowStockThreshold);
    const velocity = computeInventoryVelocity(products, velocityRows);

    // Permisos atómicos del rol: anular costos/márgenes si no puede verlos
    const perms = await getModulePermissions(auth.data, 'REPORTS', 'INVENTORY');
    const payload = { summary, products, movements, velocity, turnover };
    if (!perms.showCosts)  nullifyKeysDeep(payload, new Set(["avg_cost", "stock_value", "total_stock_value", "dead_stock_value", "turnover_ratio", "days_of_inventory", "avg_stock_value"]));
    if (!perms.showProfit) nullifyKeysDeep(payload, new Set(["margin_pct"]));

    return Response.json(payload);
  } catch (error) {
    console.error("GET /api/reports/inventory:", error);
    return createErrorResponse("Error al generar reporte de inventario", 500);
  }
}
