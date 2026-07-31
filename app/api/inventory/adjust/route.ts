// app/api/inventory/adjust/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule } from "@/lib/auth";
import { consumeFifo, InsufficientStockError } from "@/lib/fifo";

const sql = neon(process.env.DATABASE_URL!);

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'INVENTORY', 'canEdit');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const body              = await request.json();

    const { product_id, variant_id, type, quantity, notes, unit_cost } = body;

    // ── Validaciones ───────────────────────────────────────────────
    if (!product_id)
      return createErrorResponse("El producto es requerido", 400);
    if (!type || !["in", "out"].includes(type))
      return createErrorResponse("El tipo debe ser 'in' o 'out'", 400);
    if (!quantity || quantity < 1)
      return createErrorResponse("La cantidad debe ser al menos 1", 400);
    if (!notes?.trim())
      return createErrorResponse("El motivo del ajuste es requerido", 400);

    const unitCost  = Number(unit_cost) || 0;
    const variantId = variant_id ? Number(variant_id) : null;

    if (type === "in" && unitCost < 0)
      return createErrorResponse("El costo unitario no puede ser negativo", 400);

    // Verificar producto
    const [product] = await sql`
      SELECT id, is_service FROM products
      WHERE id = ${product_id} AND org_id = ${orgId} AND is_active = TRUE
    `;
    if (!product) return createErrorResponse("Producto no encontrado", 404);
    if (product.is_service)
      return createErrorResponse("No se puede ajustar inventario de un servicio", 400);

    // Verificar variante si se envió
    if (variantId !== null) {
      const [variant] = await sql`
        SELECT id FROM product_variants
        WHERE id         = ${variantId}
          AND product_id = ${product_id}
          AND org_id     = ${orgId}
          AND is_active  = TRUE
      `;
      if (!variant)
        return createErrorResponse(
          `Variante #${variantId} no encontrada o no pertenece a este producto`,
          404
        );
    }

    // Verificar stock disponible para OUT (filtrado por variante)
    if (type === "out") {
      const [stockRow] = variantId !== null
        ? await sql`
            SELECT COALESCE(SUM(qty_available), 0)::numeric AS stock
            FROM inventory_batches
            WHERE product_id = ${product_id}
              AND variant_id = ${variantId}
              AND org_id     = ${orgId}
          `
        : await sql`
            SELECT COALESCE(SUM(qty_available), 0)::numeric AS stock
            FROM inventory_batches
            WHERE product_id = ${product_id}
              AND variant_id IS NULL
              AND org_id     = ${orgId}
          `;

      if (Number(stockRow.stock) < quantity) {
        return createErrorResponse(
          `Stock insuficiente. Disponible: ${stockRow.stock} unidades`,
          400
        );
      }
    }

    const movementType = type === "in" ? "IN" : "OUT";

    await sql`BEGIN`;
    try {

      if (type === "in") {
        // ── Ajuste positivo: nuevo batch ────────────────────────────
        const [batch] = await sql`
          INSERT INTO inventory_batches (
            org_id, created_by, product_id, variant_id,
            purchase_batch_item_id,
            qty_in, qty_available, unit_cost, received_at
          ) VALUES (
            ${orgId}, ${userId}, ${product_id}, ${variantId},
            ${null},
            ${quantity}, ${quantity}, ${unitCost}, NOW()
          )
          RETURNING id
        `;

        await sql`
          INSERT INTO inventory_movements (
            org_id, created_by, movement_type, product_id, variant_id,
            quantity, reference_type, reference_id, notes
          ) VALUES (
            ${orgId}, ${userId}, ${movementType}, ${product_id}, ${variantId},
            ${quantity}, 'ADJUSTMENT', ${batch.id}, ${notes.trim()}
          )
        `;

      } else {
        // ── Ajuste negativo: FIFO atómico por variante (ver lib/fifo.ts):
        // bajo concurrencia nunca sobregira el stock.
        const consumed = await consumeFifo(
          sql, orgId, Number(product_id), variantId, Number(quantity)
        );
        if (!consumed) {
          throw new InsufficientStockError("el producto");
        }

        await sql`
          INSERT INTO inventory_movements (
            org_id, created_by, movement_type, product_id, variant_id,
            quantity, reference_type, reference_id, notes
          ) VALUES (
            ${orgId}, ${userId}, ${movementType}, ${product_id}, ${variantId},
            ${quantity}, 'ADJUSTMENT', ${null}, ${notes.trim()}
          )
        `;
      }

      await sql`COMMIT`;

      return Response.json(
        {
          message: type === "in"
            ? "Ajuste positivo registrado exitosamente"
            : "Ajuste negativo registrado exitosamente",
          data: { product_id, variant_id: variantId, type, quantity },
        },
        { status: 201 }
      );

    } catch (innerError) {
      await sql`ROLLBACK`;
      if (innerError instanceof InsufficientStockError) {
        return createErrorResponse(
          "Stock insuficiente: otro proceso consumió el inventario al mismo tiempo",
          409
        );
      }
      throw innerError;
    }

  } catch (error) {
    console.error("POST /api/inventory/adjust:", error);
    return createErrorResponse("Error al registrar el ajuste", 500);
  }
}
