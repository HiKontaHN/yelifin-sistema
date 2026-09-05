// app/api/supplies/[id]/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'INVENTORY', 'canEdit', 'SUPPLIES');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const { id } = await params;
    const supplyId = Number(id);
    if (!supplyId || isNaN(supplyId)) return createErrorResponse("ID inválido", 400);

    const body = await request.json();
    const name = (body?.name ?? "").trim();
    const unit = (body?.unit ?? "unit").trim();
    const min_stock = Number(body?.min_stock ?? 0);

    if (!name) return createErrorResponse("El nombre es requerido", 400);

    await sql`
      UPDATE supplies
      SET name = ${name}, unit = ${unit}, min_stock = ${min_stock}, updated_by = ${userId}
      WHERE id = ${supplyId} AND org_id = ${orgId}
    `;

    return Response.json({ message: "Suministro actualizado" });
  } catch (error: any) {
    if (String(error?.message ?? "").toLowerCase().includes("unique"))
      return createErrorResponse("Ya existe un suministro con ese nombre", 400);
    console.error(" PUT /api/supplies/[id]:", error);
    return createErrorResponse("Error al actualizar suministro", 500);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'INVENTORY', 'canDelete', 'SUPPLIES');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const { id } = await params;
    const supplyId = Number(id);
    if (!supplyId || isNaN(supplyId)) return createErrorResponse("ID inválido", 400);

    await sql`DELETE FROM supplies WHERE id = ${supplyId} AND org_id = ${orgId}`;

    return Response.json({ message: "Suministro eliminado" });
  } catch (error) {
    console.error(" DELETE /api/supplies/[id]:", error);
    return createErrorResponse("Error al eliminar suministro", 500);
  }
}