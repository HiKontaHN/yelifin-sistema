// app/api/organization/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);

  try {
    const { orgId } = auth.data;

    const [org] = await sql`
      SELECT id, name, slug, logo_url, timezone, currency, locale, industry_id, created_at
      FROM organizations
      WHERE id = ${orgId}
    `;

    return Response.json({ data: org });
  } catch (error) {
    console.error("GET /api/organization:", error);
    return createErrorResponse("Error al obtener organización", 500);
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);

  if (!auth.data.isOwner) {
    return createErrorResponse("Solo el dueño puede editar la organización", 403);
  }

  try {
    const { orgId } = auth.data;
    const body = await request.json();

    const allowed = ["name", "logo_url", "timezone", "currency", "locale"] as const;
    type Field = (typeof allowed)[number];

    const updates: Partial<Record<Field, string>> = {};
    for (const key of allowed) {
      if (key in body && body[key] !== undefined) {
        updates[key] = body[key];
      }
    }

    const industryId = "industry_id" in body ? body.industry_id : undefined;
    if (industryId !== undefined && industryId !== null) {
      const [industry] = await sql`SELECT id FROM industries WHERE id = ${industryId} AND is_active = TRUE`;
      if (!industry) return createErrorResponse("Industria inválida", 400);
    }

    if (Object.keys(updates).length === 0 && industryId === undefined) {
      return createErrorResponse("No hay campos para actualizar", 400);
    }

    // Mismo criterio que el resto de los campos: solo se actualiza si viene
    // un valor no nulo (esta ruta no soporta "limpiar" la industria a NULL).
    const [org] = await sql`
      UPDATE organizations
      SET
        name        = COALESCE(${updates.name     ?? null}, name),
        logo_url    = COALESCE(${updates.logo_url  ?? null}, logo_url),
        timezone    = COALESCE(${updates.timezone  ?? null}, timezone),
        currency    = COALESCE(${updates.currency  ?? null}, currency),
        locale      = COALESCE(${updates.locale    ?? null}, locale),
        industry_id = COALESCE(${industryId ?? null}, industry_id),
        updated_at  = NOW()
      WHERE id = ${orgId}
      RETURNING id, name, slug, logo_url, timezone, currency, locale, industry_id
    `;

    return Response.json({ data: org });
  } catch (error) {
    console.error("PATCH /api/organization:", error);
    return createErrorResponse("Error al actualizar organización", 500);
  }
}
