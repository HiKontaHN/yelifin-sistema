// app/api/inventory/existing/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule } from "@/lib/auth";
import { resolveWarehouseId } from "@/lib/warehouses";

const sql = neon(process.env.DATABASE_URL!);

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'INVENTORY', 'canEdit');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const body              = await request.json();

    const { product_id, variant_id, quantity, unit_cost, purchased_at, notes, warehouse_id } = body;

    // ── Validaciones ───────────────────────────────────────────────
    if (!product_id)
      return createErrorResponse("El producto es requerido", 400);
    if (!quantity || quantity < 1)
      return createErrorResponse("La cantidad debe ser al menos 1", 400);

    const wh = await resolveWarehouseId(sql, orgId, warehouse_id);
    if (wh.warehouseId === null) return createErrorResponse(wh.error, 400);
    const warehouseId: number = wh.warehouseId;

    const variantId = variant_id ? Number(variant_id) : null;

    // Verificar producto
    const [product] = await sql`
      SELECT id, is_service FROM products
      WHERE id = ${product_id} AND org_id = ${orgId} AND is_active = TRUE
    `;
    if (!product)
      return createErrorResponse("Producto no encontrado", 404);
    if (product.is_service)
      return createErrorResponse("No se puede registrar inventario inicial para un servicio", 400);

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

    const unitCost   = Number(unit_cost) || 0;
    const receivedAt = purchased_at
      ? new Date(purchased_at).toISOString()
      : new Date().toISOString();
    const finalNotes = notes?.trim() || "Inventario inicial";

    // ── Transacción atómica ────────────────────────────────────────
    await sql`BEGIN`;
    try {
      const [batch] = await sql`
        INSERT INTO inventory_batches (
          org_id, created_by, product_id, variant_id,
          purchase_batch_item_id,
          qty_in, qty_available, unit_cost, received_at, warehouse_id
        ) VALUES (
          ${orgId}, ${userId}, ${product_id}, ${variantId},
          ${null},
          ${quantity}, ${quantity}, ${unitCost}, ${receivedAt}, ${warehouseId}
        )
        RETURNING id
      `;

      await sql`
        INSERT INTO inventory_movements (
          org_id, created_by, movement_type, product_id, variant_id,
          quantity, reference_type, reference_id, notes, warehouse_id
        ) VALUES (
          ${orgId}, ${userId}, 'IN', ${product_id}, ${variantId},
          ${quantity}, 'INITIAL', ${batch.id}, ${finalNotes}, ${warehouseId}
        )
      `;

      await sql`COMMIT`;

      return Response.json(
        {
          message: "Inventario inicial registrado exitosamente",
          data: {
            batch_id:   batch.id,
            product_id,
            variant_id: variantId,
            quantity,
            unit_cost:  unitCost,
          },
        },
        { status: 201 }
      );

    } catch (innerError) {
      await sql`ROLLBACK`;
      throw innerError;
    }

  } catch (error) {
    console.error("POST /api/inventory/existing:", error);
    return createErrorResponse("Error al registrar inventario inicial", 500);
  }
}
