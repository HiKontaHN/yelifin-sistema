import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";

import { createErrorResponse, isAuthSuccess, verifyAuth } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);

  if (!auth.data.isOwner) {
    return createErrorResponse("Solo el dueño puede consultar el vínculo con el partner", 403);
  }

  try {
    const [partner] = await sql`
      SELECT
        p.id AS partner_id,
        p.name,
        p.contact_name,
        p.email,
        p.phone,
        po.share_financials,
        po.linked_at
      FROM partner_organizations po
      JOIN partners p ON p.id = po.partner_id
      WHERE po.org_id = ${auth.data.orgId}
      ORDER BY po.linked_at ASC
      LIMIT 1
    `;

    return Response.json({ data: partner ?? null });
  } catch (error) {
    console.error("GET /api/organization/partner:", error);
    return createErrorResponse("Error al obtener la información del partner", 500);
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);

  if (!auth.data.isOwner) {
    return createErrorResponse("Solo el dueño puede cambiar este permiso", 403);
  }

  try {
    const body = await request.json();
    if (typeof body?.share_financials !== "boolean") {
      return createErrorResponse("El permiso financiero debe ser verdadero o falso", 400);
    }

    const [partner] = await sql`
      WITH updated AS (
        UPDATE partner_organizations
        SET share_financials = ${body.share_financials}
        WHERE org_id = ${auth.data.orgId}
        RETURNING partner_id, share_financials, linked_at
      )
      SELECT
        p.id AS partner_id,
        p.name,
        p.contact_name,
        p.email,
        p.phone,
        updated.share_financials,
        updated.linked_at
      FROM updated
      JOIN partners p ON p.id = updated.partner_id
      LIMIT 1
    `;

    if (!partner) {
      return createErrorResponse("Tu negocio no está vinculado a un partner", 404);
    }

    return Response.json({ data: partner });
  } catch (error) {
    console.error("PATCH /api/organization/partner:", error);
    return createErrorResponse("Error al actualizar el permiso financiero", 500);
  }
}
