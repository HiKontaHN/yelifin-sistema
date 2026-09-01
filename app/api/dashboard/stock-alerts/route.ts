// app/api/dashboard/stock-alerts/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule, getModulePermissions } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'DASHBOARD', 'canView');
  if (deny) return deny;

  const { showCosts } = await getModulePermissions(auth.data, 'DASHBOARD');

  try {
    const { orgId } = auth.data;

    // ── Top ventas en riesgo: productos más vendidos (30 días) cuyo stock
    //    se agotará en menos de 15 días al ritmo de venta actual ─────────
    const critical = await sql`
      WITH sales_30 AS (
        SELECT si.product_id, SUM(si.quantity)::int AS units_sold
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id AND s.org_id = si.org_id
        WHERE si.org_id = ${orgId} AND s.status = 'COMPLETED'
          AND s.sold_at >= NOW() - INTERVAL '30 days'
        GROUP BY si.product_id
      ),
      stock AS (
        SELECT product_id, COALESCE(SUM(qty_available), 0)::int AS stock
        FROM inventory_batches
        WHERE org_id = ${orgId}
        GROUP BY product_id
      ),
      ranked AS (
        SELECT
          p.id, p.name, p.sku, p.image_url,
          s30.units_sold,
          COALESCE(st.stock, 0) AS stock,
          ROUND((COALESCE(st.stock, 0)::numeric / (s30.units_sold::numeric / 30)), 1) AS days_coverage
        FROM products p
        JOIN sales_30 s30 ON s30.product_id = p.id
        LEFT JOIN stock st ON st.product_id = p.id
        WHERE p.org_id = ${orgId} AND p.is_active = TRUE AND p.is_service = FALSE
      )
      SELECT * FROM ranked
      WHERE days_coverage <= 15
      ORDER BY days_coverage ASC, units_sold DESC
      LIMIT 8
    `;

    // ── Tendencia de rotación: unidades vendidas últimos 15 días vs los
    //    15 días anteriores, para detectar demanda acelerando o cayendo ──
    const rotation = await sql`
      WITH recent AS (
        SELECT si.product_id, SUM(si.quantity)::int AS units
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id AND s.org_id = si.org_id
        WHERE si.org_id = ${orgId} AND s.status = 'COMPLETED'
          AND s.sold_at >= NOW() - INTERVAL '15 days'
        GROUP BY si.product_id
      ),
      previous AS (
        SELECT si.product_id, SUM(si.quantity)::int AS units
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id AND s.org_id = si.org_id
        WHERE si.org_id = ${orgId} AND s.status = 'COMPLETED'
          AND s.sold_at >= NOW() - INTERVAL '30 days' AND s.sold_at < NOW() - INTERVAL '15 days'
        GROUP BY si.product_id
      ),
      stock AS (
        SELECT product_id, COALESCE(SUM(qty_available), 0)::int AS stock
        FROM inventory_batches
        WHERE org_id = ${orgId}
        GROUP BY product_id
      ),
      combined AS (
        SELECT
          p.id, p.name, p.sku, p.image_url,
          COALESCE(r.units, 0) AS units_recent,
          COALESCE(pr.units, 0) AS units_previous,
          COALESCE(st.stock, 0) AS stock
        FROM products p
        LEFT JOIN recent r ON r.product_id = p.id
        LEFT JOIN previous pr ON pr.product_id = p.id
        LEFT JOIN stock st ON st.product_id = p.id
        WHERE p.org_id = ${orgId} AND p.is_active = TRUE AND p.is_service = FALSE
          AND (COALESCE(r.units, 0) > 0 OR COALESCE(pr.units, 0) > 0)
      )
      SELECT *,
        CASE
          WHEN units_previous > 0 THEN ROUND(((units_recent - units_previous)::numeric / units_previous) * 100, 1)
          WHEN units_recent > 0 THEN 100
          ELSE 0
        END AS trend_pct
      FROM combined
      ORDER BY ABS(
        CASE
          WHEN units_previous > 0 THEN ((units_recent - units_previous)::numeric / units_previous) * 100
          WHEN units_recent > 0 THEN 100
          ELSE 0
        END
      ) DESC
      LIMIT 8
    `;

    // ── Sin movimiento: productos con stock disponible sin ventas en los
    //    últimos 30 días (o nunca vendidos) ─────────────────────────────
    const stale = await sql`
      WITH stock AS (
        SELECT
          product_id,
          COALESCE(SUM(qty_available), 0)::int AS stock,
          COALESCE(SUM(qty_available * unit_cost), 0) AS stock_value
        FROM inventory_batches
        WHERE org_id = ${orgId}
        GROUP BY product_id
        HAVING COALESCE(SUM(qty_available), 0) > 0
      ),
      last_sale AS (
        SELECT si.product_id, MAX(s.sold_at) AS last_sale_at
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id AND s.org_id = si.org_id
        WHERE si.org_id = ${orgId} AND s.status = 'COMPLETED'
        GROUP BY si.product_id
      )
      SELECT
        p.id, p.name, p.sku, p.image_url,
        st.stock, st.stock_value,
        ls.last_sale_at,
        CASE WHEN ls.last_sale_at IS NOT NULL
             THEN EXTRACT(DAY FROM NOW() - ls.last_sale_at)::int
             ELSE NULL END AS days_since_sale,
        CASE WHEN ls.last_sale_at IS NULL
             THEN EXTRACT(DAY FROM NOW() - p.created_at)::int
             ELSE NULL END AS days_since_created
      FROM products p
      JOIN stock st ON st.product_id = p.id
      LEFT JOIN last_sale ls ON ls.product_id = p.id
      WHERE p.org_id = ${orgId} AND p.is_active = TRUE AND p.is_service = FALSE
        AND (ls.last_sale_at IS NULL OR ls.last_sale_at < NOW() - INTERVAL '30 days')
      ORDER BY COALESCE(ls.last_sale_at, p.created_at) ASC
      LIMIT 8
    `;

    return Response.json({
      data: {
        critical: critical.map((r: any) => ({
          id: Number(r.id), name: String(r.name), sku: r.sku ?? null, image_url: r.image_url ?? null,
          units_sold: Number(r.units_sold), stock: Number(r.stock), days_coverage: Number(r.days_coverage),
        })),
        rotation: rotation.map((r: any) => ({
          id: Number(r.id), name: String(r.name), sku: r.sku ?? null, image_url: r.image_url ?? null,
          units_recent: Number(r.units_recent), units_previous: Number(r.units_previous),
          stock: Number(r.stock), trend_pct: Number(r.trend_pct),
        })),
        stale: stale.map((r: any) => ({
          id: Number(r.id), name: String(r.name), sku: r.sku ?? null, image_url: r.image_url ?? null,
          stock: Number(r.stock), stock_value: showCosts ? Number(r.stock_value) : null,
          last_sale_at: r.last_sale_at ? String(r.last_sale_at) : null,
          days_since_sale: r.days_since_sale !== null ? Number(r.days_since_sale) : null,
          days_since_created: r.days_since_created !== null ? Number(r.days_since_created) : null,
        })),
      },
    });
  } catch (error) {
    console.error(" GET /api/dashboard/stock-alerts:", error);
    return createErrorResponse("Error al obtener las alertas de stock", 500);
  }
}
