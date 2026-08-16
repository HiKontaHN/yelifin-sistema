// app/api/inventory/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule, getModulePermissions, nullifyKeysDeep } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'INVENTORY', 'canView');
  if (deny) return deny;

  try {
    const { orgId }        = auth.data;
    const { searchParams } = new URL(request.url);
    const search      = searchParams.get("search")?.trim() || null;
    const stockFilter = searchParams.get("stock") || null;
    const page        = Math.max(1, Number(searchParams.get("page"))  || 1);
    const limit       = Math.min(500, Math.max(1, Number(searchParams.get("limit")) || 25));
    const offset      = (page - 1) * limit;

    // ── Stats globales (sin filtros) ──────────────────────────────────
    const [statsRow] = await sql`
      SELECT
        COUNT(DISTINCT p.id) FILTER (WHERE p.is_active = TRUE AND p.org_id = ${orgId})::int AS total_products,
        COUNT(DISTINCT p.id) FILTER (WHERE NOT p.is_service)::int AS total_physical,
        COALESCE(SUM(ib.qty_available) FILTER (WHERE NOT p.is_service), 0)::numeric AS total_stock,
        COALESCE(SUM(ib.qty_available * ib.unit_cost) FILTER (WHERE NOT p.is_service), 0)::numeric AS total_value,
        COUNT(DISTINCT p.id) FILTER (
          WHERE NOT p.is_service
            AND EXISTS (
              SELECT 1 FROM inventory_batches ib2
              WHERE ib2.product_id = p.id AND ib2.org_id = p.org_id
                AND ib2.qty_available > 0
            )
            AND (SELECT COALESCE(SUM(qty_available), 0) FROM inventory_batches WHERE product_id = p.id AND org_id = p.org_id) < 10
        )::int AS low_stock,
        COUNT(DISTINCT p.id) FILTER (
          WHERE NOT p.is_service
            AND (SELECT COALESCE(SUM(qty_available), 0) FROM inventory_batches WHERE product_id = p.id AND org_id = p.org_id) = 0
        )::int AS out_of_stock
      FROM products p
      LEFT JOIN inventory_batches ib ON ib.product_id = p.id AND ib.org_id = p.org_id
      WHERE p.org_id = ${orgId} AND p.is_active = TRUE;
    `;

    // ── Filtros dinámicos ─────────────────────────────────────────────
    const searchCondition = search
      ? sql`AND (p.name ILIKE ${'%' + search + '%'} OR p.sku ILIKE ${'%' + search + '%'})`
      : sql``;

    const stockCondition =
      stockFilter === "in_stock" ? sql`AND (p.is_service = TRUE OR (SELECT COALESCE(SUM(qty_available),0) FROM inventory_batches WHERE product_id=p.id AND org_id=p.org_id) >= 1)` :
      stockFilter === "services" ? sql`AND p.is_service = TRUE` :
      stockFilter === "ok"       ? sql`AND (p.is_service = TRUE OR (SELECT COALESCE(SUM(qty_available),0) FROM inventory_batches WHERE product_id=p.id AND org_id=p.org_id) >= 10)` :
      stockFilter === "low"      ? sql`AND p.is_service = FALSE AND (SELECT COALESCE(SUM(qty_available),0) FROM inventory_batches WHERE product_id=p.id AND org_id=p.org_id) > 0 AND (SELECT COALESCE(SUM(qty_available),0) FROM inventory_batches WHERE product_id=p.id AND org_id=p.org_id) < 10` :
      stockFilter === "out"      ? sql`AND p.is_service = FALSE AND (SELECT COALESCE(SUM(qty_available),0) FROM inventory_batches WHERE product_id=p.id AND org_id=p.org_id) = 0` :
                                   sql``;

    // ── Count para paginación ─────────────────────────────────────────
    const [{ count }] = await sql`
      SELECT COUNT(DISTINCT p.id)::int AS count
      FROM products p
      WHERE p.org_id = ${orgId} AND p.is_active = TRUE
      ${searchCondition}
      ${stockCondition}
    `;

    const totalPages = Math.max(1, Math.ceil(count / limit));

    // ── Data paginada ─────────────────────────────────────────────────
    const inventory = await sql`
      SELECT
        p.id             AS product_id,
        p.name           AS product_name,
        p.sku,
        p.is_service,
        p.image_url,
        p.price,

        COALESCE(SUM(ib.qty_available), 0)::numeric AS stock,

        COALESCE(SUM(
          CASE WHEN ib.variant_id IS NULL THEN ib.qty_available ELSE 0 END
        ), 0)::numeric AS base_stock,

        CASE
          WHEN SUM(CASE WHEN ib.variant_id IS NULL THEN ib.qty_available ELSE 0 END) > 0
          THEN ROUND(
            SUM(CASE WHEN ib.variant_id IS NULL THEN ib.qty_available * ib.unit_cost ELSE 0 END) /
            SUM(CASE WHEN ib.variant_id IS NULL THEN ib.qty_available ELSE 0 END), 4
          )
          ELSE 0
        END AS base_avg_unit_cost,

        ROUND(
          COALESCE(SUM(
            CASE WHEN ib.variant_id IS NULL THEN ib.qty_available * ib.unit_cost ELSE 0 END
          ), 0), 2
        ) AS base_total_value,

        CASE
          WHEN SUM(ib.qty_available) > 0
          THEN ROUND(
            SUM(ib.qty_available * ib.unit_cost) / SUM(ib.qty_available), 4
          )
          ELSE 0
        END AS avg_unit_cost,
        ROUND(
          COALESCE(SUM(ib.qty_available * ib.unit_cost), 0), 2
        ) AS total_value,

        (
          SELECT COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'variant_id',     pv.id,
                'variant_name',   pv.variant_name,
                'sku',            pv.sku,
                'attributes',     pv.attributes,
                'price_override', pv.price_override,
                'image_url',      pv.image_url,
                'stock',          COALESCE(vib.stock, 0),
                'avg_unit_cost',  COALESCE(vib.avg_cost, 0),
                'total_value',    COALESCE(vib.total_val, 0)
              ) ORDER BY pv.id
            ),
            '[]'::jsonb
          )
          FROM product_variants pv
          LEFT JOIN LATERAL (
            SELECT
              SUM(qty_available)::numeric AS stock,
              CASE
                WHEN SUM(qty_available) > 0
                THEN ROUND(SUM(qty_available * unit_cost) / SUM(qty_available), 4)
                ELSE 0
              END AS avg_cost,
              ROUND(COALESCE(SUM(qty_available * unit_cost), 0), 2) AS total_val
            FROM inventory_batches
            WHERE org_id     = p.org_id
              AND product_id = p.id
              AND variant_id = pv.id
          ) vib ON TRUE
          WHERE pv.product_id = p.id
            AND pv.org_id     = p.org_id
            AND pv.is_active  = TRUE
        ) AS variants_stock

      FROM products p
      LEFT JOIN inventory_batches ib
        ON ib.product_id = p.id
       AND ib.org_id     = p.org_id
      WHERE p.org_id    = ${orgId}
        AND p.is_active = TRUE
      ${searchCondition}
      ${stockCondition}
      GROUP BY p.id
      ORDER BY p.name ASC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const payload = {
      data:       inventory,
      total:      count,
      page,
      totalPages,
      limit,
      stats: {
        total_products: statsRow.total_products,
        total_physical: statsRow.total_physical,
        total_stock:    Number(statsRow.total_stock),
        total_value:    Number(statsRow.total_value) as number | null,
        low_stock:      statsRow.low_stock,
        out_of_stock:   statsRow.out_of_stock,
      },
    };

    // Costo promedio y valor total (agregado, por producto y por variante)
    // solo viajan si el rol tiene show_costs — el frontend ya oculta estas
    // columnas, esto evita que el dato real viaje igual en la respuesta.
    const perms = await getModulePermissions(auth.data, 'INVENTORY');
    if (!perms.showCosts) {
      nullifyKeysDeep(payload, new Set([
        "avg_unit_cost", "total_value", "base_avg_unit_cost", "base_total_value",
      ]));
    }

    return Response.json(payload);

  } catch (error) {
    console.error("GET /api/inventory:", error);
    return createErrorResponse("Error al obtener inventario", 500);
  }
}
