// app/api/organization/warehouses/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, verifyResourceLimit, requireModule } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);

  try {
    const { orgId } = auth.data;

    const warehouses = await sql`
      SELECT id, name, is_active, is_default, created_at
      FROM warehouses
      WHERE org_id = ${orgId}
      ORDER BY is_default DESC, name ASC
    `;

    return Response.json({ data: warehouses });
  } catch (error) {
    console.error("GET /api/organization/warehouses:", error);
    return createErrorResponse("Error al obtener bodegas", 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);

  const denyWarehouses = await requireModule(auth.data, 'ADMIN', 'canEdit', 'WAREHOUSES');
  if (denyWarehouses) return denyWarehouses;

  const limit = await verifyResourceLimit(auth.data.orgId, "warehouses");
  if (!limit.withinLimit) {
    return createErrorResponse(limit.error ?? "Límite alcanzado", limit.status, "needsUpgrade" in limit ? !!limit.needsUpgrade : false);
  }

  try {
    const { userId, orgId } = auth.data;
    const { name } = await request.json();

    if (!name?.trim()) return createErrorResponse("El nombre de la bodega es requerido", 400);

    const [warehouse] = await sql`
      INSERT INTO warehouses (org_id, name, created_by, updated_by)
      VALUES (${orgId}, ${name.trim()}, ${userId}, ${userId})
      RETURNING id, name, is_active, is_default, created_at
    `;

    return Response.json({ data: warehouse }, { status: 201 });
  } catch (error) {
    console.error("POST /api/organization/warehouses:", error);
    return createErrorResponse("Error al crear bodega", 500);
  }
}
