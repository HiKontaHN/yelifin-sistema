import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireFeature, requireModule } from "@/lib/auth";
import { withTransaction } from "@/lib/db-transaction";

const sql = neon(process.env.DATABASE_URL!);
const FEATURE = "customers.manage";
const ROLES = ["CLIENT", "SUPPLIER", "THIRD_PARTY", "CONTACT"] as const;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, "CUSTOMERS", "canEdit");
  if (deny) return deny;
  const feature = await requireFeature(auth.data.orgId, FEATURE);
  if (feature) return feature;
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return createErrorResponse("Persona inválida", 400);
  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const role = String(body.role ?? "THIRD_PARTY").toUpperCase();
    if (!name) return createErrorResponse("El nombre es requerido", 400);
    if (!ROLES.includes(role as any)) return createErrorResponse("Rol inválido", 400);
    const result = await withTransaction(async (tx) => {
      const [person] = await tx`SELECT id, source_customer_id FROM people WHERE id = ${id} AND org_id = ${auth.data.orgId} AND is_active = TRUE FOR UPDATE`;
      if (!person) return null;
      const [updated] = await tx`
        UPDATE people SET name = ${name}, email = ${body.email ?? null}, phone = ${body.phone ?? null}, notes = ${body.notes ?? null}, updated_by = ${auth.data.userId}, updated_at = NOW()
        WHERE id = ${id} AND org_id = ${auth.data.orgId} RETURNING *
      `;
      if (person.source_customer_id) {
        await tx`UPDATE customers SET name = ${name}, email = ${body.email ?? null}, phone = ${body.phone ?? null}, notes = ${body.notes ?? null}, total_orders = ${Math.max(0, Math.trunc(Number(body.total_orders ?? 0)))}, total_spent = ${Math.max(0, Number(body.total_spent ?? 0))} WHERE id = ${person.source_customer_id} AND org_id = ${auth.data.orgId}`;
      }
      await tx`DELETE FROM person_roles WHERE person_id = ${id}`;
      await tx`INSERT INTO person_roles (person_id, role, is_primary) VALUES (${id}, ${role}, TRUE)`;
      return { ...updated, roles: [role] };
    });
    if (!result) return createErrorResponse("Persona no encontrada", 404);
    return Response.json({ data: result });
  } catch (error) {
    console.error("PATCH /api/people/[id]:", error);
    return createErrorResponse("Error al actualizar la persona", 500);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, "CUSTOMERS", "canDelete");
  if (deny) return deny;
  const feature = await requireFeature(auth.data.orgId, FEATURE);
  if (feature) return feature;
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return createErrorResponse("Persona inválida", 400);
  try {
    const [person] = await sql`
      UPDATE people SET is_active = FALSE, updated_by = ${auth.data.userId}, updated_at = NOW()
      WHERE id = ${id} AND org_id = ${auth.data.orgId} AND is_active = TRUE
      RETURNING id
    `;
    if (!person) return createErrorResponse("Persona no encontrada", 404);
    return Response.json({ message: "Persona eliminada" });
  } catch (error) {
    console.error("DELETE /api/people/[id]:", error);
    return createErrorResponse("Error al eliminar la persona", 500);
  }
}
