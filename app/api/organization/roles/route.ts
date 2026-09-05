// app/api/organization/roles/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess } from "@/lib/auth";
import { MODULES, MODULE_SUBITEMS } from "@/lib/permissions";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);

  try {
    const { orgId } = auth.data;

    const roles = await sql`
      SELECT id, name, is_owner, created_at
      FROM org_roles
      WHERE org_id = ${orgId}
      ORDER BY is_owner DESC, name ASC
    `;

    const perms = await sql`
      SELECT r.id AS role_id, p.module, p.subitem, p.can_view, p.can_edit, p.can_delete, p.show_costs, p.show_profit
      FROM org_roles r
      JOIN org_role_permissions p ON p.role_id = r.id
      WHERE r.org_id = ${orgId}
    `;

    // Permisos anidados por módulo y luego por subitem.
    const permsByRole = new Map<number, Record<string, Record<string, object>>>();
    for (const p of perms) {
      if (!permsByRole.has(p.role_id)) permsByRole.set(p.role_id, {});
      const rolePerms = permsByRole.get(p.role_id)!;
      (rolePerms[p.module] ??= {})[p.subitem] = {
        can_view:    p.can_view,
        can_edit:    p.can_edit,
        can_delete:  p.can_delete,
        show_costs:  p.show_costs,
        show_profit: p.show_profit,
      };
    }

    const data = roles.map((r) => ({
      ...r,
      permissions: permsByRole.get(r.id) ?? {},
    }));

    return Response.json({ data });
  } catch (error) {
    console.error("GET /api/organization/roles:", error);
    return createErrorResponse("Error al obtener roles", 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);

  if (!auth.data.isOwner) {
    return createErrorResponse("Solo el dueño puede crear roles", 403);
  }

  try {
    const { orgId } = auth.data;
    const { name, permissions } = await request.json();

    if (!name?.trim()) return createErrorResponse("El nombre del rol es requerido", 400);

    const [role] = await sql`
      INSERT INTO org_roles (org_id, name, is_owner)
      VALUES (${orgId}, ${name.trim()}, FALSE)
      RETURNING id, name, is_owner, created_at
    `;

    // Insertar permisos: una fila por subitem, tomando el valor de ese
    // subitem si el payload lo trae (formato anidado {module: {subitem: ...}}),
    // o false si no.
    for (const module of MODULES) {
      const modulePerms = permissions?.[module] ?? {};
      for (const { code: subitem } of MODULE_SUBITEMS[module]) {
        const p = modulePerms[subitem] ?? {};
        await sql`
          INSERT INTO org_role_permissions (role_id, module, subitem, can_view, can_edit, can_delete, show_costs, show_profit)
          VALUES (
            ${role.id}, ${module}, ${subitem},
            ${p.can_view    ?? false},
            ${p.can_edit    ?? false},
            ${p.can_delete  ?? false},
            ${p.show_costs  ?? false},
            ${p.show_profit ?? false}
          )
        `;
      }
    }

    const savedPerms = await sql`
      SELECT module, subitem, can_view, can_edit, can_delete, show_costs, show_profit
      FROM org_role_permissions WHERE role_id = ${role.id}
    `;

    const permissionsMap: Record<string, Record<string, object>> = {};
    for (const p of savedPerms) {
      (permissionsMap[p.module] ??= {})[p.subitem] = {
        can_view: p.can_view, can_edit: p.can_edit, can_delete: p.can_delete,
        show_costs: p.show_costs, show_profit: p.show_profit,
      };
    }

    return Response.json({ data: { ...role, permissions: permissionsMap } }, { status: 201 });
  } catch (error: any) {
    if (error?.code === "23505") {
      return createErrorResponse("Ya existe un rol con ese nombre", 409);
    }
    console.error("POST /api/organization/roles:", error);
    return createErrorResponse("Error al crear rol", 500);
  }
}
