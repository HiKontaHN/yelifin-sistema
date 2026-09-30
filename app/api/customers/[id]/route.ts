// app/api/customers/[id]/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule, requireFeature } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'CUSTOMERS', 'canEdit');
  if (deny) return deny;
  const denyFeature = await requireFeature(auth.data.orgId, 'customers.manage');
  if (denyFeature) return denyFeature;

  try {
    const { userId, orgId } = auth.data;
    const { id } = await params;
    const customerId = Number(id);

    if (isNaN(customerId)) return createErrorResponse("ID inválido", 400);

    const { name, phone, email, notes, total_orders, total_spent } = await request.json();

    if (total_orders !== undefined && (isNaN(Number(total_orders)) || Number(total_orders) < 0)) {
      return createErrorResponse("Las órdenes deben ser un número mayor o igual a 0", 400);
    }
    if (total_spent !== undefined && (isNaN(Number(total_spent)) || Number(total_spent) < 0)) {
      return createErrorResponse("El total comprado debe ser un número mayor o igual a 0", 400);
    }

    // total_orders/total_spent son un contador acumulado, no un histórico
    // separado: al editarlos se sobreescribe el valor actual y las ventas
    // nuevas se siguen sumando desde ahí (app/api/sales/route.ts).
    const [updated] = await sql`
      UPDATE customers SET
        name         = COALESCE(${name  ?? null}, name),
        phone        = COALESCE(${phone ?? null}, phone),
        email        = COALESCE(${email ?? null}, email),
        notes        = COALESCE(${notes ?? null}, notes),
        total_orders = COALESCE(${total_orders !== undefined ? Math.trunc(Number(total_orders)) : null}, total_orders),
        total_spent  = COALESCE(${total_spent  !== undefined ? Number(total_spent)              : null}, total_spent),
        updated_at   = CURRENT_TIMESTAMP,
        updated_by   = ${userId}
      WHERE id = ${customerId} AND org_id = ${orgId}
      RETURNING *
    `;

    if (!updated) return createErrorResponse("Cliente no encontrado", 404);

    return Response.json({ data: updated });

  } catch (error) {
    console.error(" PATCH /api/customers/[id]:", error);
    return createErrorResponse("Error al actualizar cliente", 500);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'CUSTOMERS', 'canDelete');
  if (deny) return deny;
  const denyFeature = await requireFeature(auth.data.orgId, 'customers.manage');
  if (denyFeature) return denyFeature;

  try {
    const { userId, orgId } = auth.data;
    const { id } = await params;
    const customerId = Number(id);

    if (isNaN(customerId)) return createErrorResponse("ID inválido", 400);

    await sql`
      DELETE FROM customers
      WHERE id = ${customerId} AND org_id = ${orgId}
    `;

    return Response.json({ message: "Cliente eliminado correctamente" });

  } catch (error) {
    console.error(" DELETE /api/customers/[id]:", error);
    return createErrorResponse("Error al eliminar cliente", 500);
  }
}