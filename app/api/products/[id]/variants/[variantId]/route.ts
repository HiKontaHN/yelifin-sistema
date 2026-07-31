// app/api/products/[id]/variants/[variantId]/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);

type Params = { params: Promise<{ id: string; variantId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'PRODUCTS', 'canEdit');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const { id, variantId } = await params;
    const productId  = Number(id);
    const variantIdN = Number(variantId);

    if (isNaN(productId) || isNaN(variantIdN)) {
      return createErrorResponse("ID inválido", 400);
    }

    // Verificar que la variante existe, pertenece a la org y al producto correcto
    const [existing] = await sql`
      SELECT id FROM product_variants
      WHERE id         = ${variantIdN}
        AND product_id = ${productId}
        AND org_id     = ${orgId}
      LIMIT 1
    `;
    if (!existing) return createErrorResponse("Variante no encontrada", 404);

    const body = await request.json();
    const { variant_name, sku, attributes, price_override, image_url, is_active } = body;

    // Distinguir "no enviado" (conservar) de null (limpiar override)
    const priceOverrideProvided = "price_override" in body;

    if (price_override !== undefined && price_override !== null) {
      if (isNaN(Number(price_override)) || Number(price_override) < 0) {
        return createErrorResponse("El precio debe ser un número mayor o igual a 0", 400);
      }
    }

    // No permitir desactivar una variante que aún tiene stock: quedaría
    // invisible en el desglose pero seguiría sumando al stock total.
    if (is_active === false) {
      const [stockRow] = await sql`
        SELECT COALESCE(SUM(qty_available), 0)::numeric AS stock
        FROM inventory_batches
        WHERE variant_id = ${variantIdN} AND org_id = ${orgId}
      `;
      if (Number(stockRow.stock) > 0) {
        return createErrorResponse(
          `La variante aún tiene ${stockRow.stock} unidades en stock. Ajusta el inventario antes de desactivarla`,
          400
        );
      }
    }

    // Verificar SKU duplicado (excluyendo la misma variante)
    if (sku) {
      const [skuConflict] = await sql`
        SELECT id FROM product_variants
        WHERE org_id = ${orgId}
          AND sku    = ${sku}
          AND id    != ${variantIdN}
        LIMIT 1
      `;
      if (skuConflict) {
        return createErrorResponse("Ya existe una variante con este SKU", 409);
      }
    }

    const [updated] = await sql`
      UPDATE product_variants SET
        variant_name   = COALESCE(${variant_name  ?? null}, variant_name),
        sku            = COALESCE(${sku?.trim() || null}, sku),
        attributes     = COALESCE(${attributes    ? JSON.stringify(attributes) : null}, attributes),
        price_override = CASE
                           WHEN ${priceOverrideProvided}
                           THEN ${price_override !== undefined && price_override !== null
                                    ? Number(price_override)
                                    : null}::numeric
                           ELSE price_override
                         END,
        image_url      = COALESCE(${image_url     ?? null}, image_url),
        is_active      = COALESCE(${is_active     !== undefined ? is_active : null}, is_active),
        updated_at     = CURRENT_TIMESTAMP,
        updated_by     = ${userId}
      WHERE id         = ${variantIdN}
        AND product_id = ${productId}
        AND org_id     = ${orgId}
      RETURNING *
    `;

    return Response.json({ data: updated });
  } catch (error) {
    console.error("PATCH /api/products/[id]/variants/[variantId]:", error);
    return createErrorResponse("Error al actualizar variante", 500);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'PRODUCTS', 'canDelete');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const { id, variantId } = await params;
    const productId  = Number(id);
    const variantIdN = Number(variantId);

    if (isNaN(productId) || isNaN(variantIdN)) {
      return createErrorResponse("ID inválido", 400);
    }

    const [existing] = await sql`
      SELECT id FROM product_variants
      WHERE id         = ${variantIdN}
        AND product_id = ${productId}
        AND org_id     = ${orgId}
      LIMIT 1
    `;
    if (!existing) return createErrorResponse("Variante no encontrada", 404);

    // No permitir desactivar/eliminar una variante con stock: quedaría
    // invisible en el desglose pero seguiría sumando al stock total.
    const [stockRow] = await sql`
      SELECT COALESCE(SUM(qty_available), 0)::numeric AS stock
      FROM inventory_batches
      WHERE variant_id = ${variantIdN} AND org_id = ${orgId}
    `;
    if (Number(stockRow.stock) > 0) {
      return createErrorResponse(
        `La variante aún tiene ${stockRow.stock} unidades en stock. Ajusta el inventario antes de eliminarla`,
        400
      );
    }

    // Verificar si tiene historial en ventas, inventario, compras o eventos.
    // Todas estas tablas tienen FK ON DELETE RESTRICT: si no se cuentan,
    // el DELETE físico falla con un 500 en vez de hacer soft-delete.
    const [usage] = await sql`
      SELECT (
        (SELECT COUNT(*) FROM inventory_movements  WHERE variant_id = ${variantIdN}) +
        (SELECT COUNT(*) FROM sale_items           WHERE variant_id = ${variantIdN}) +
        (SELECT COUNT(*) FROM inventory_batches    WHERE variant_id = ${variantIdN}) +
        (SELECT COUNT(*) FROM purchase_batch_items WHERE variant_id = ${variantIdN}) +
        (SELECT COUNT(*) FROM event_inventory      WHERE variant_id = ${variantIdN})
      ) AS total
    `;

    if (Number(usage.total) === 0) {
      await sql`
        DELETE FROM product_variants
        WHERE id         = ${variantIdN}
          AND product_id = ${productId}
          AND org_id     = ${orgId}
      `;
      return Response.json({ message: "Variante eliminada permanentemente" });
    }

    // Con historial → soft delete
    await sql`
      UPDATE product_variants SET
        is_active  = FALSE,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = ${userId}
      WHERE id         = ${variantIdN}
        AND product_id = ${productId}
        AND org_id     = ${orgId}
    `;

    return Response.json({ message: "Variante desactivada correctamente" });
  } catch (error) {
    console.error("DELETE /api/products/[id]/variants/[variantId]:", error);
    return createErrorResponse("Error al eliminar variante", 500);
  }
}
