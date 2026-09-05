// app/api/organization/members/[id]/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);

// Actualizar rol de un miembro
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);

  const denyTeam = await requireModule(auth.data, 'ADMIN', 'canEdit', 'TEAM');
  if (denyTeam) return denyTeam;

  try {
    const { orgId } = auth.data;
    const { id } = await params;
    const memberId = Number(id);
    const body = await request.json();
    const { role_id } = body;

    if (!role_id) return createErrorResponse("role_id es requerido", 400);

    // Bodega asignada a este miembro (de dónde descuentan sus ventas) — solo
    // se toca si el body trae la clave explícitamente. null la desasigna
    // (cae a la bodega default de la org).
    let defaultWarehouseId: number | null | undefined = undefined;
    if ("default_warehouse_id" in body) {
      if (body.default_warehouse_id === null) {
        defaultWarehouseId = null;
      } else {
        const [w] = await sql`
          SELECT id FROM warehouses
          WHERE id = ${Number(body.default_warehouse_id)} AND org_id = ${orgId} AND is_active = TRUE
        `;
        if (!w) return createErrorResponse("Bodega no encontrada o inactiva", 400);
        defaultWarehouseId = Number(w.id);
      }
    }

    // Verificar que el rol pertenece a esta org
    const [role] = await sql`
      SELECT id, is_owner FROM org_roles WHERE id = ${role_id} AND org_id = ${orgId}
    `;
    if (!role) return createErrorResponse("Rol no válido para esta organización", 400);
    if (role.is_owner) {
      return createErrorResponse("No se puede asignar el rol de dueño a otro miembro", 403);
    }

    // Buscar membresía
    const [member] = await sql`
      SELECT om.id, om.user_id
      FROM organization_members om
      WHERE om.id = ${memberId} AND om.org_id = ${orgId} AND om.is_active = TRUE
    `;
    if (!member) return createErrorResponse("Miembro no encontrado", 404);

    // No permitir cambiar el rol del owner de la org
    const [org] = await sql`SELECT owner_user_id FROM organizations WHERE id = ${orgId}`;
    if (member.user_id === org.owner_user_id) {
      return createErrorResponse("No se puede cambiar el rol del dueño de la organización", 403);
    }

    const [updated] = await sql`
      UPDATE organization_members
      SET role_id = ${role_id},
          default_warehouse_id = CASE WHEN ${defaultWarehouseId !== undefined} THEN ${defaultWarehouseId ?? null} ELSE default_warehouse_id END
      WHERE id = ${memberId} AND org_id = ${orgId}
      RETURNING id, user_id, role_id, is_active, joined_at
    `;

    const [result] = await sql`
      SELECT
        om.id, om.user_id, om.role_id, om.is_active, om.joined_at, om.default_warehouse_id,
        u.email, u.display_name,
        r.name AS role_name, r.is_owner AS is_owner_role,
        w.name AS default_warehouse_name
      FROM organization_members om
      JOIN users u     ON u.id = om.user_id
      JOIN org_roles r ON r.id = om.role_id
      LEFT JOIN warehouses w ON w.id = om.default_warehouse_id
      WHERE om.id = ${updated.id}
    `;

    return Response.json({ data: result });
  } catch (error) {
    console.error("PATCH /api/organization/members/[id]:", error);
    return createErrorResponse("Error al actualizar miembro", 500);
  }
}

// Revocar acceso de un miembro
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);

  const denyTeam = await requireModule(auth.data, 'ADMIN', 'canDelete', 'TEAM');
  if (denyTeam) return denyTeam;

  try {
    const { orgId, userId } = auth.data;
    const { id } = await params;
    const memberId = Number(id);

    const [member] = await sql`
      SELECT om.id, om.user_id
      FROM organization_members om
      WHERE om.id = ${memberId} AND om.org_id = ${orgId} AND om.is_active = TRUE
    `;
    if (!member) return createErrorResponse("Miembro no encontrado", 404);

    // No permitir que el owner se revoque a sí mismo
    if (member.user_id === userId) {
      return createErrorResponse("No puedes revocar tu propio acceso como dueño", 403);
    }

    await sql`
      UPDATE organization_members
      SET is_active = FALSE
      WHERE id = ${memberId} AND org_id = ${orgId}
    `;

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("DELETE /api/organization/members/[id]:", error);
    return createErrorResponse("Error al revocar acceso", 500);
  }
}
