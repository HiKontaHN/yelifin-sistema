// app/api/organization/warehouses/[id]/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);

  const denyWarehouses = await requireModule(auth.data, 'ADMIN', 'canEdit', 'WAREHOUSES');
  if (denyWarehouses) return denyWarehouses;

  try {
    const { userId, orgId } = auth.data;
    const { id } = await params;
    const warehouseId = Number(id);
    if (isNaN(warehouseId)) return createErrorResponse("ID inválido", 400);

    const { name, is_active, is_default } = await request.json();

    const [warehouse] = await sql`
      SELECT id, is_default FROM warehouses WHERE id = ${warehouseId} AND org_id = ${orgId}
    `;
    if (!warehouse) return createErrorResponse("Bodega no encontrada", 404);

    // Marcar como default: quita el default anterior y pone este.
    if (is_default === true && !warehouse.is_default) {
      await sql`UPDATE warehouses SET is_default = FALSE, updated_by = ${userId} WHERE org_id = ${orgId} AND is_default = TRUE`;
      await sql`UPDATE warehouses SET is_default = TRUE, updated_by = ${userId} WHERE id = ${warehouseId}`;
    }

    // Desactivar: bloquear si es la default, o si algún miembro activo la
    // tiene asignada — ambos casos romperían el flujo de ventas.
    if (is_active === false) {
      if (warehouse.is_default) {
        return createErrorResponse("No puedes desactivar la bodega por defecto — marca otra como default primero", 400);
      }
      const [assigned] = await sql`
        SELECT COUNT(*)::int AS count FROM organization_members
        WHERE org_id = ${orgId} AND is_active = TRUE AND default_warehouse_id = ${warehouseId}
      `;
      if (Number(assigned.count) > 0) {
        return createErrorResponse("Hay miembros del equipo asignados a esta bodega — reasígnalos antes de desactivarla", 400);
      }
    }

    const [updated] = await sql`
      UPDATE warehouses SET
        name       = COALESCE(${name?.trim() ?? null}, name),
        is_active  = COALESCE(${is_active ?? null}, is_active),
        updated_by = ${userId}
      WHERE id = ${warehouseId} AND org_id = ${orgId}
      RETURNING id, name, is_active, is_default, created_at
    `;

    return Response.json({ data: updated });
  } catch (error) {
    console.error("PATCH /api/organization/warehouses/[id]:", error);
    return createErrorResponse("Error al editar bodega", 500);
  }
}
