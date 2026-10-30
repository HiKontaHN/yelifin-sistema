import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireFeature, requireModule } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);
const FEATURE = "finances.receivables_payables";
const VALID_TYPES = ["SUPPLIER", "BANK", "FINANCIAL_INSTITUTION", "PERSON", "OTHER"];
type RouteParams = Promise<{ id: string }>;

async function getContext(request: NextRequest, params: RouteParams, permission: "canEdit" | "canDelete") {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return { error: createErrorResponse(auth.error, auth.status) };
  const deny = await requireModule(auth.data, "FINANCES", permission, "ACCOUNTS");
  if (deny) return { error: deny };
  const feature = await requireFeature(auth.data.orgId, FEATURE);
  if (feature) return { error: feature };
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return { error: createErrorResponse("ID inválido", 400) };
  return { auth, id };
}

export async function PATCH(request: NextRequest, { params }: { params: RouteParams }) {
  const context = await getContext(request, params, "canEdit");
  if (context.error) return context.error;

  try {
    const body = await request.json();
    const name = body.name == null ? null : String(body.name).trim();
    const entityType = body.entity_type == null ? null : String(body.entity_type);
    if (name === "") return createErrorResponse("El nombre es requerido", 400);
    if (entityType && !VALID_TYPES.includes(entityType)) return createErrorResponse("Tipo de entidad inválido", 400);

    const [entity] = await sql`
      UPDATE financial_entities SET
        name = COALESCE(${name}, name),
        entity_type = COALESCE(${entityType}, entity_type),
        tax_id = ${body.tax_id ?? null},
        contact_name = ${body.contact_name ?? null},
        email = ${body.email ?? null},
        phone = ${body.phone ?? null},
        address = ${body.address ?? null},
        notes = ${body.notes ?? null},
        updated_at = NOW(),
        updated_by = ${context.auth.data.userId}
      WHERE id = ${context.id} AND org_id = ${context.auth.data.orgId} AND is_active = TRUE
      RETURNING *
    `;
    if (!entity) return createErrorResponse("Entidad no encontrada", 404);
    return Response.json({ data: entity });
  } catch (error) {
    console.error("PATCH /api/financial-entities/[id]:", error);
    return createErrorResponse("Error al actualizar la entidad", 500);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: RouteParams }) {
  const context = await getContext(request, params, "canDelete");
  if (context.error) return context.error;

  try {
    const [entity] = await sql`
      UPDATE financial_entities
      SET is_active = FALSE, updated_at = NOW(), updated_by = ${context.auth.data.userId}
      WHERE id = ${context.id} AND org_id = ${context.auth.data.orgId} AND is_active = TRUE
      RETURNING id
    `;
    if (!entity) return createErrorResponse("Entidad no encontrada", 404);
    return Response.json({ message: "Entidad desactivada" });
  } catch (error) {
    console.error("DELETE /api/financial-entities/[id]:", error);
    return createErrorResponse("Error al desactivar la entidad", 500);
  }
}
