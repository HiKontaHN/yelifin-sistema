// app/api/transaction-categories/[id]/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'FINANCES', 'canEdit', 'TRANSACTIONS');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const { id } = await params;
    const categoryId = Number(id);

    if (isNaN(categoryId)) return createErrorResponse("ID inválido", 400);

    const body = await request.json();
    const { name, is_active } = body;

    if (name !== undefined && (typeof name !== "string" || name.trim().length < 1)) {
      return createErrorResponse("El nombre no puede estar vacío", 400);
    }

    const [category] = await sql`
      UPDATE transaction_categories SET
        name       = COALESCE(${name      ?? null}, name),
        is_active  = COALESCE(${is_active !== undefined ? is_active : null}, is_active),
        updated_at = NOW(),
        updated_by = ${userId}
      WHERE id      = ${categoryId}
        AND org_id  = ${orgId}
      RETURNING *
    `;

    if (!category) return createErrorResponse("Categoría no encontrada", 404);

    return Response.json({ data: category });
  } catch (error: any) {
    if (error.code === "23505") {
      return createErrorResponse(
        "Ya existe una categoría con ese nombre para este tipo",
        409
      );
    }
    console.error("PATCH /api/transaction-categories/[id]:", error);
    return createErrorResponse("Error al actualizar categoría", 500);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'FINANCES', 'canDelete', 'TRANSACTIONS');
  if (deny) return deny;

  try {
    const { userId, orgId } = auth.data;
    const { id } = await params;
    const categoryId = Number(id);

    if (isNaN(categoryId)) return createErrorResponse("ID inválido", 400);

    const [category] = await sql`
      UPDATE transaction_categories SET
        is_active  = FALSE,
        updated_at = NOW(),
        updated_by = ${userId}
      WHERE id      = ${categoryId}
        AND org_id  = ${orgId}
      RETURNING id
    `;

    if (!category) return createErrorResponse("Categoría no encontrada", 404);

    return Response.json({ message: "Categoría desactivada correctamente" });
  } catch (error) {
    console.error("DELETE /api/transaction-categories/[id]:", error);
    return createErrorResponse("Error al eliminar categoría", 500);
  }
}