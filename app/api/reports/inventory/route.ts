// app/api/reports/inventory/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule, requireFeature, getModulePermissions, nullifyKeysDeep } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'REPORTS', 'canView');
  if (deny) return deny;
  const denyFeature = await requireFeature(auth.data.orgId, 'reports.inventory');
  if (denyFeature) return denyFeature;

  try {
    const { userId, orgId } = auth.data;
    const { searchParams } = new URL(request.url);
    const lowStockThreshold = Number(searchParams.get("low_stock") ?? "5");

    // ── Por producto (stock actual) ────────────────────────────────
    const products = await sql`
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

    // ── Resumen ────────────────────────────────────────────────────
    const totalProducts   = products.length;
    const totalStockValue = products.reduce((a: number, p: any) => a + Number(p.stock_value), 0);
    const totalStock      = products.reduce((a: number, p: any) => a + Number(p.stock), 0);
    const lowStockCount   = products.filter((p: any) => Number(p.stock) > 0 && Number(p.stock) <= lowStockThreshold).length;
    const zeroStockCount  = products.filter((p: any) => Number(p.stock) === 0).length;

    // ── Movimientos recientes (últimos 30 días) ────────────────────
    const movements = await sql`
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
        AND im.created_at >= NOW() - INTERVAL '30 days'
      ORDER BY im.created_at DESC
      LIMIT 200
    `;

    const summary = {
      total_products:   totalProducts,
      total_stock:      totalStock,
      total_stock_value: totalStockValue,
      low_stock_count:  lowStockCount,
      zero_stock_count: zeroStockCount,
    };

    // Permisos atómicos del rol: anular costos/márgenes si no puede verlos
    const perms = await getModulePermissions(auth.data, 'REPORTS');
    const payload = { summary, products, movements };
    if (!perms.showCosts)  nullifyKeysDeep(payload, new Set(["avg_cost", "stock_value", "total_stock_value"]));
    if (!perms.showProfit) nullifyKeysDeep(payload, new Set(["margin_pct"]));

    return Response.json(payload);
  } catch (error) {
    console.error("GET /api/reports/inventory:", error);
    return createErrorResponse("Error al generar reporte de inventario", 500);
  }
}
