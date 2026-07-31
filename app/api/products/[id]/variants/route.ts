// app/api/products/[id]/variants/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule } from "@/lib/auth";
import { nextVariantSkus, isVariantSkuAvailable, variantSkuBase } from "@/lib/sku";

const sql = neon(process.env.DATABASE_URL!);

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'PRODUCTS', 'canEdit');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const { id } = await params;
    const productId = Number(id);

    if (isNaN(productId)) return createErrorResponse("ID inválido", 400);

    // Verificar que el producto padre existe y pertenece a la org
    const [product] = await sql`
      SELECT id, sku, image_url FROM products
      WHERE id        = ${productId}
        AND org_id    = ${orgId}
        AND is_active = TRUE
      LIMIT 1
    `;
    if (!product) return createErrorResponse("Producto no encontrado", 404);

    const body = await request.json();
    const { variant_name, sku, attributes, price_override, image_url, base_conversion } = body;

    if (!variant_name || typeof variant_name !== "string" || variant_name.trim().length < 1) {
      return createErrorResponse("El nombre de la variante es requerido", 400);
    }

    if (price_override !== undefined && price_override !== null) {
      if (isNaN(Number(price_override)) || Number(price_override) < 0) {
        return createErrorResponse("El precio debe ser un número mayor o igual a 0", 400);
      }
    }

    const skuBase = variantSkuBase(product.sku, productId);

    // ── Conversión del stock base en variante ─────────────────────────
    // Al crear la PRIMERA variante de un producto que ya tiene stock, el
    // stock base representa una variante implícita (p. ej. el color
    // original). Se crea como variante con nombre propio y se le migran
    // los lotes del base, dejando al producto como "padre" puro.
    // Los SKUs se asignan en orden: la variante del stock actual toma el
    // primer disponible (V0-001-01) y la nueva el siguiente (V0-001-02).
    let baseName: string | null = null;
    let baseSkuFinal: string | null = null;
    if (base_conversion) {
      baseName =
        typeof base_conversion.variant_name === "string"
          ? base_conversion.variant_name.trim()
          : "";
      if (!baseName)
        return createErrorResponse(
          "El nombre para la variante del stock actual es requerido",
          400
        );

      const [{ count: activeCount }] = await sql`
        SELECT COUNT(*)::int AS count FROM product_variants
        WHERE product_id = ${productId} AND org_id = ${orgId} AND is_active = TRUE
      `;
      if (Number(activeCount) > 0)
        return createErrorResponse(
          "El stock base solo puede convertirse al crear la primera variante",
          400
        );

      baseSkuFinal = base_conversion.sku?.trim() || null;
      if (baseSkuFinal) {
        if (!(await isVariantSkuAvailable(sql, orgId, baseSkuFinal)))
          return createErrorResponse("Ya existe una variante con el SKU del stock actual", 409);
      } else {
        [baseSkuFinal] = await nextVariantSkus(sql, orgId, skuBase, 1);
      }
    }

    // SKU de la variante nueva: el enviado (verificado) o el siguiente
    // disponible, sin chocar con el recién asignado a la variante base.
    let finalSku = sku?.trim() || null;
    if (finalSku) {
      if (baseSkuFinal === finalSku)
        return createErrorResponse("Los SKUs de las variantes no pueden repetirse", 409);
      if (!(await isVariantSkuAvailable(sql, orgId, finalSku)))
        return createErrorResponse("Ya existe una variante con este SKU", 409);
    } else {
      [finalSku] = await nextVariantSkus(
        sql, orgId, skuBase, 1, baseSkuFinal ? [baseSkuFinal] : []
      );
    }

    await sql`BEGIN`;
    try {
      let baseVariant: any = null;
      if (baseName) {
        [baseVariant] = await sql`
          INSERT INTO product_variants (
            org_id, created_by, product_id, variant_name, sku,
            attributes, price_override, image_url
          ) VALUES (
            ${orgId}, ${userId}, ${productId}, ${baseName}, ${baseSkuFinal},
            ${null}, ${null}, ${product.image_url ?? null}
          )
          RETURNING *
        `;

        // Migrar TODOS los lotes del base (incluidos los agotados, para
        // conservar el historial de costos) a la nueva variante
        await sql`
          UPDATE inventory_batches
          SET variant_id = ${baseVariant.id}
          WHERE product_id = ${productId}
            AND org_id     = ${orgId}
            AND variant_id IS NULL
        `;
      }

      const [variant] = await sql`
        INSERT INTO product_variants (
          org_id,
          created_by,
          product_id,
          variant_name,
          sku,
          attributes,
          price_override,
          image_url
        )
        VALUES (
          ${orgId},
          ${userId},
          ${productId},
          ${variant_name.trim()},
          ${finalSku},
          ${attributes     ? JSON.stringify(attributes) : null},
          ${price_override !== undefined && price_override !== null && Number(price_override) > 0
              ? Number(price_override)
              : null},
          ${image_url      ?? null}
        )
        RETURNING *
      `;

      await sql`COMMIT`;
      return Response.json(
        { data: variant, base_variant: baseVariant },
        { status: 201 }
      );
    } catch (innerError) {
      await sql`ROLLBACK`;
      throw innerError;
    }
  } catch (error) {
    console.error("POST /api/products/[id]/variants:", error);
    return createErrorResponse("Error al crear variante", 500);
  }
}
