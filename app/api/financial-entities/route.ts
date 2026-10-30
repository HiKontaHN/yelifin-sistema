import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireFeature, requireModule } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);
const FEATURE = "finances.receivables_payables";

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, "FINANCES", "canView", "ACCOUNTS");
  if (deny) return deny;
  const feature = await requireFeature(auth.data.orgId, FEATURE);
  if (feature) return feature;

  try {
    const data = await sql`
      SELECT id, name, entity_type, tax_id, contact_name, email, phone, address, notes, created_at
      FROM financial_entities
      WHERE org_id = ${auth.data.orgId} AND is_active = TRUE
      ORDER BY name ASC
    `;
    return Response.json({ data });
  } catch (error) {
    console.error("GET /api/financial-entities:", error);
    return createErrorResponse("Error al obtener entidades", 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, "FINANCES", "canEdit", "ACCOUNTS");
  if (deny) return deny;
  const feature = await requireFeature(auth.data.orgId, FEATURE);
  if (feature) return feature;

  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const entityType = String(body.entity_type ?? "OTHER");
    const validTypes = ["SUPPLIER", "BANK", "FINANCIAL_INSTITUTION", "PERSON", "OTHER"];
    if (!name) return createErrorResponse("El nombre es requerido", 400);
    if (!validTypes.includes(entityType)) return createErrorResponse("Tipo de entidad inválido", 400);

    const [entity] = await sql`
      INSERT INTO financial_entities (org_id, name, entity_type, tax_id, contact_name, email, phone, address, notes, created_by)
      VALUES (${auth.data.orgId}, ${name}, ${entityType}, ${body.tax_id ?? null}, ${body.contact_name ?? null},
        ${body.email ?? null}, ${body.phone ?? null}, ${body.address ?? null}, ${body.notes ?? null}, ${auth.data.userId})
      RETURNING *
    `;
    return Response.json({ data: entity }, { status: 201 });
  } catch (error) {
    console.error("POST /api/financial-entities:", error);
    return createErrorResponse("Error al crear entidad", 500);
  }
}
