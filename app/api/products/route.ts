// app/api/products/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule, verifyResourceLimit } from "@/lib/auth";
import { nextProductSkus, isProductSkuAvailable, skuPrefixFromName } from "@/lib/sku";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'PRODUCTS', 'canView');
  if (deny) return deny;

  try {
    const { orgId } = auth.data;

    const products = await sql`
      SELECT
        p.id,
        p.org_id,
        p.name,
        p.description,
        p.is_service,
        p.sku,
        p.barcode,
        p.price,
        p.image_url,
        p.is_active,
        p.created_at,
        p.updated_at,
        COALESCE(SUM(ib.qty_available), 0) AS stock,
        (
          SELECT COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id',             pv.id,
                'variant_name',   pv.variant_name,
                'sku',            pv.sku,
                'attributes',     pv.attributes,
                'price_override', pv.price_override,
                'image_url',      pv.image_url,
                'is_active',      pv.is_active,
                'created_at',     pv.created_at,
                'updated_at',     pv.updated_at
              ) ORDER BY pv.id
            ),
            '[]'::jsonb
          )
          FROM product_variants pv
          WHERE pv.product_id = p.id
            AND pv.is_active  = TRUE
        ) AS variants
      FROM products p
      LEFT JOIN inventory_batches ib
        ON ib.product_id = p.id
       AND ib.org_id     = p.org_id
      WHERE p.org_id    = ${orgId}
        AND p.is_active = TRUE
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `;

    return Response.json({
      data: products,
      total: products.length,
    });
  } catch (error) {
    console.error("GET /api/products:", error);
    return createErrorResponse("Error al obtener productos", 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'PRODUCTS', 'canEdit');
  if (deny) return deny;

  const limit = await verifyResourceLimit(auth.data.orgId, "products");
  if (!limit.withinLimit) {
    return createErrorResponse(limit.error ?? "Límite alcanzado", limit.status, "needsUpgrade" in limit ? !!limit.needsUpgrade : false);
  }

  try {
    const { userId, orgId } = auth.data;
    const body = await request.json();
    const { name, description, sku, price, image_url, is_service } = body;

    if (!name || typeof name !== "string" || name.trim().length < 1) {
      return createErrorResponse("El nombre del producto es requerido", 400);
    }

    if (price === undefined || isNaN(Number(price)) || Number(price) < 0) {
      return createErrorResponse(
        "El precio debe ser un número mayor o igual a 0",
        400
      );
    }

    const [limitCheck] = await sql`
      SELECT
        sp.max_products,
        (
          SELECT COUNT(*)
          FROM products p
          WHERE p.org_id   = ${orgId}
            AND p.is_active = TRUE
        )::int AS current_count
      FROM org_subscriptions us
      JOIN subscription_plans sp ON sp.id = us.plan_id
      WHERE us.org_id = ${orgId}
      ORDER BY us.created_at DESC
      LIMIT 1
    `;

    if (
      limitCheck &&
      limitCheck.max_products !== null &&
      Number(limitCheck.current_count) >= Number(limitCheck.max_products)
    ) {
      return createErrorResponse(
        "Has alcanzado el límite de productos para tu plan",
        403,
        true
      );
    }

    // SKU: el enviado (verificado) o el siguiente disponible según las
    // iniciales del nombre (PHK-001, PHK-002, ... rellenando huecos)
    let finalSku = sku?.trim() || null;
    if (finalSku) {
      if (!(await isProductSkuAvailable(sql, orgId, finalSku))) {
        return createErrorResponse("Ya existe un producto con este SKU", 409);
      }
    } else {
      [finalSku] = await nextProductSkus(sql, orgId, skuPrefixFromName(name), 1);
    }

    const [product] = await sql`
      INSERT INTO products (org_id, created_by, name, description, sku, barcode, price, image_url, is_service)
      VALUES (
        ${orgId},
        ${userId},
        ${name.trim()},
        ${description  ?? null},
        ${finalSku},
        ${null},
        ${Number(price)},
        ${image_url    ?? null},
        ${is_service   ?? false}
      )
      RETURNING *
    `;

    // Devolver con variants vacío para consistencia de shape
    return Response.json(
      { data: { ...product, variants: [] } },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/products:", error);
    return createErrorResponse("Error al crear producto", 500);
  }
}
