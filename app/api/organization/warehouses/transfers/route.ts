// app/api/organization/warehouses/transfers/route.ts
// Mueve stock de una bodega a otra: consume FIFO en el origen (mismo
// mecanismo atómico que una venta) y crea un lote nuevo en el destino con
// el costo promedio ponderado de lo consumido. Ver
// database/migrations/v4.20-warehouses.sql (warehouse_transfers).
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule } from "@/lib/auth";
import { consumeFifo, InsufficientStockError } from "@/lib/fifo";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'INVENTORY', 'canView', 'STOCK');
  if (deny) return deny;

  try {
    const { orgId } = auth.data;

    const transfers = await sql`
      SELECT
        wt.id, wt.notes, wt.created_at,
        wf.name AS from_warehouse_name,
        wto.name AS to_warehouse_name,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'product_name', p.name,
            'variant_name', pv.variant_name,
            'quantity', wti.quantity,
            'unit_cost', wti.unit_cost
          ) ORDER BY wti.id)
          FROM warehouse_transfer_items wti
          JOIN products p ON p.id = wti.product_id
          LEFT JOIN product_variants pv ON pv.id = wti.variant_id
          WHERE wti.transfer_id = wt.id
        ), '[]'::jsonb) AS items
      FROM warehouse_transfers wt
      JOIN warehouses wf  ON wf.id  = wt.from_warehouse_id
      JOIN warehouses wto ON wto.id = wt.to_warehouse_id
      WHERE wt.org_id = ${orgId}
      ORDER BY wt.created_at DESC
      LIMIT 100
    `;

    return Response.json({ data: transfers });
  } catch (error) {
    console.error("GET /api/organization/warehouses/transfers:", error);
    return createErrorResponse("Error al obtener transferencias", 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'INVENTORY', 'canEdit', 'STOCK');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const { from_warehouse_id, to_warehouse_id, items, notes } = await request.json();

    const fromId = Number(from_warehouse_id);
    const toId   = Number(to_warehouse_id);

    if (!fromId || !toId) return createErrorResponse("Ambas bodegas son requeridas", 400);
    if (fromId === toId)  return createErrorResponse("La bodega de origen y destino deben ser diferentes", 400);
    if (!items || !Array.isArray(items) || items.length === 0)
      return createErrorResponse("Se requiere al menos un producto", 400);

    const [fromWh] = await sql`SELECT id FROM warehouses WHERE id = ${fromId} AND org_id = ${orgId} AND is_active = TRUE`;
    if (!fromWh) return createErrorResponse("Bodega de origen no encontrada o inactiva", 404);
    const [toWh] = await sql`SELECT id FROM warehouses WHERE id = ${toId} AND org_id = ${orgId} AND is_active = TRUE`;
    if (!toWh) return createErrorResponse("Bodega de destino no encontrada o inactiva", 404);

    for (const item of items) {
      if (!item.product_id || !item.quantity || item.quantity <= 0)
        return createErrorResponse("Datos de producto inválidos", 400);
    }

    await sql`BEGIN`;
    try {
      const [transfer] = await sql`
        INSERT INTO warehouse_transfers (org_id, from_warehouse_id, to_warehouse_id, notes, created_by)
        VALUES (${orgId}, ${fromId}, ${toId}, ${notes?.trim() || null}, ${userId})
        RETURNING id
      `;
      const transferId = transfer.id as number;

      for (const item of items) {
        const productId = Number(item.product_id);
        const variantId = item.variant_id ? Number(item.variant_id) : null;
        const quantity  = Number(item.quantity);

        const consumed = await consumeFifo(sql, orgId, productId, variantId, quantity, userId, fromId);
        if (!consumed) throw new InsufficientStockError(`Producto #${productId}`);

        const unitCost = consumed.totalCost / quantity;

        const [newBatch] = await sql`
          INSERT INTO inventory_batches (
            org_id, created_by, product_id, variant_id, purchase_batch_item_id,
            qty_in, qty_available, unit_cost, received_at, warehouse_id
          ) VALUES (
            ${orgId}, ${userId}, ${productId}, ${variantId}, ${null},
            ${quantity}, ${quantity}, ${unitCost}, NOW(), ${toId}
          )
          RETURNING id
        `;

        await sql`
          INSERT INTO warehouse_transfer_items (org_id, transfer_id, product_id, variant_id, quantity, unit_cost)
          VALUES (${orgId}, ${transferId}, ${productId}, ${variantId}, ${quantity}, ${unitCost})
        `;

        await sql`
          INSERT INTO inventory_movements (
            org_id, created_by, movement_type, product_id, variant_id,
            quantity, reference_type, reference_id, warehouse_id, notes
          ) VALUES (
            ${orgId}, ${userId}, 'OUT', ${productId}, ${variantId},
            ${quantity}, 'TRANSFER_OUT', ${transferId}, ${fromId}, ${notes?.trim() || null}
          )
        `;
        await sql`
          INSERT INTO inventory_movements (
            org_id, created_by, movement_type, product_id, variant_id,
            quantity, reference_type, reference_id, warehouse_id, notes
          ) VALUES (
            ${orgId}, ${userId}, 'IN', ${productId}, ${variantId},
            ${quantity}, 'TRANSFER_IN', ${transferId}, ${toId}, ${notes?.trim() || null}
          )
        `;
      }

      await sql`COMMIT`;
      return Response.json({ message: "Transferencia registrada", data: { id: transferId } }, { status: 201 });
    } catch (innerError) {
      await sql`ROLLBACK`;
      if (innerError instanceof InsufficientStockError) {
        return createErrorResponse(`Stock insuficiente en la bodega de origen para ${innerError.label}`, 409);
      }
      throw innerError;
    }
  } catch (error) {
    console.error("POST /api/organization/warehouses/transfers:", error);
    return createErrorResponse("Error al registrar la transferencia", 500);
  }
}
