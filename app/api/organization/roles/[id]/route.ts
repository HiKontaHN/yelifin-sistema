// app/api/organization/roles/[id]/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, OrgModule } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);

const MODULES: OrgModule[] = [
  "DASHBOARD", "PRODUCTS", "INVENTORY", "SALES", "CUSTOMERS",
  "FINANCES", "EVENTS", "REPORTS", "ADMIN",
];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);

  if (!auth.data.isOwner) {
    return createErrorResponse("Solo el dueño puede editar roles", 403);
  }

  try {
    const { orgId } = auth.data;
    const { id } = await params;
    const roleId = Number(id);
    const { name, permissions } = await request.json();

    const [role] = await sql`
      SELECT id, is_owner FROM org_roles WHERE id = ${roleId} AND org_id = ${orgId}
    `;
    if (!role) return createErrorResponse("Rol no encontrado", 404);

    // El rol "Dueño" no se puede renombrar ni modificar (tiene bypass total)
    if (role.is_owner && (name !== undefined || permissions !== undefined)) {
      return createErrorResponse("El rol del dueño no se puede modificar", 403);
    }

    let updatedRole = role;
    if (name?.trim()) {
      [updatedRole] = await sql`
        UPDATE org_roles SET name = ${name.trim()}, updated_at = NOW()
        WHERE id = ${roleId} AND org_id = ${orgId}
        RETURNING id, name, is_owner, created_at
      `;
    } else {
      [updatedRole] = await sql`
        SELECT id, name, is_owner, created_at FROM org_roles WHERE id = ${roleId}
      `;
    }

    // Upsert de permisos para los módulos provistos
    if (permissions && typeof permissions === "object") {
      for (const module of MODULES) {
        if (!(module in permissions)) continue;
        const p = permissions[module];
        await sql`
          INSERT INTO org_role_permissions (role_id, module, can_view, can_edit, can_delete, show_costs, show_profit)
          VALUES (
            ${roleId}, ${module},
            ${p.can_view    ?? false},
            ${p.can_edit    ?? false},
            ${p.can_delete  ?? false},
            ${p.show_costs  ?? false},
            ${p.show_profit ?? false}
          )
          ON CONFLICT (role_id, module) DO UPDATE SET
            can_view    = EXCLUDED.can_view,
            can_edit    = EXCLUDED.can_edit,
            can_delete  = EXCLUDED.can_delete,
            show_costs  = EXCLUDED.show_costs,
            show_profit = EXCLUDED.show_profit
        `;
      }
    }

    const savedPerms = await sql`
      SELECT module, can_view, can_edit, can_delete, show_costs, show_profit
      FROM org_role_permissions WHERE role_id = ${roleId}
    `;

    const permissionsMap: Record<string, object> = {};
    for (const p of savedPerms) {
      permissionsMap[p.module] = {
        can_view: p.can_view, can_edit: p.can_edit, can_delete: p.can_delete,
        show_costs: p.show_costs, show_profit: p.show_profit,
      };
    }

    return Response.json({ data: { ...updatedRole, permissions: permissionsMap } });
  } catch (error: any) {
    if (error?.code === "23505") {
      return createErrorResponse("Ya existe un rol con ese nombre", 409);
    }
    console.error("PATCH /api/organization/roles/[id]:", error);
    return createErrorResponse("Error al actualizar rol", 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);

  if (!auth.data.isOwner) {
    return createErrorResponse("Solo el dueño puede eliminar roles", 403);
  }

  try {
    const { orgId } = auth.data;
    const { id } = await params;
    const roleId = Number(id);

    const [role] = await sql`
      SELECT id, is_owner FROM org_roles WHERE id = ${roleId} AND org_id = ${orgId}
    `;
    if (!role) return createErrorResponse("Rol no encontrado", 404);
    if (role.is_owner) return createErrorResponse("No se puede eliminar el rol del dueño", 403);

    // Verificar que ningún miembro activo tenga este rol
    const [inUse] = await sql`
      SELECT 1 FROM organization_members
      WHERE role_id = ${roleId} AND is_active = TRUE
      LIMIT 1
    `;
    if (inUse) {
      return createErrorResponse(
        "No se puede eliminar un rol que tiene miembros activos asignados",
        409
      );
    }

    await sql`DELETE FROM org_roles WHERE id = ${roleId} AND org_id = ${orgId}`;

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("DELETE /api/organization/roles/[id]:", error);
    return createErrorResponse("Error al eliminar rol", 500);
  }
}
