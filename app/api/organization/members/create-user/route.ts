// app/api/organization/members/create-user/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireFeature } from "@/lib/auth";
import { adminAuth } from "@/lib/firebase-admin";

const sql = neon(process.env.DATABASE_URL!);

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);

  if (!auth.data.isOwner) {
    return createErrorResponse("Solo el dueño puede crear miembros", 403);
  }

  const denyFeature = await requireFeature(auth.data.orgId, "admin.multi_user");
  if (denyFeature) return denyFeature;

  try {
    const { orgId } = auth.data;
    const { email, password, display_name, role_id } = await request.json();

    if (!email?.trim())    return createErrorResponse("El email es requerido", 400);
    if (!password?.trim()) return createErrorResponse("La contraseña es requerida", 400);
    if (password.length < 6) return createErrorResponse("La contraseña debe tener al menos 6 caracteres", 400);
    if (!role_id)          return createErrorResponse("El rol es requerido", 400);

    // Verificar que el rol pertenece a esta org y no es el rol owner
    const [role] = await sql`
      SELECT id, is_owner FROM org_roles WHERE id = ${role_id} AND org_id = ${orgId}
    `;
    if (!role)          return createErrorResponse("Rol no válido para esta organización", 400);
    if (role.is_owner)  return createErrorResponse("No se puede asignar el rol de dueño a un miembro nuevo", 400);

    // Obtener timezone/currency/locale de la org para el perfil del nuevo usuario
    const [org] = await sql`
      SELECT timezone, currency, locale FROM organizations WHERE id = ${orgId}
    `;

    // Verificar que el email no está ya en uso en esta org
    const [existingInOrg] = await sql`
      SELECT om.id FROM organization_members om
      JOIN users u ON u.id = om.user_id
      WHERE om.org_id = ${orgId} AND u.email = ${email.trim().toLowerCase()} AND om.is_active = TRUE
    `;
    if (existingInOrg) return createErrorResponse("Ya existe un miembro con ese email en esta organización", 409);

    // Crear usuario en Firebase
    let fbUser;
    try {
      fbUser = await adminAuth.createUser({
        email:         email.trim().toLowerCase(),
        password,
        displayName:   display_name?.trim() || undefined,
        emailVerified: true,
        disabled:      false,
      });
    } catch (fbErr: any) {
      const msg = fbErr.code === "auth/email-already-exists"
        ? "Ya existe un usuario con ese email"
        : fbErr.message ?? "Error al crear usuario";
      return createErrorResponse(msg, 409);
    }

    // Crear registros en PostgreSQL — si algo falla, rollback del usuario
    // de Firebase para no dejarlo huérfano (ej: email ya existente en users
    // por ser miembro de otra organización)
    let member;
    try {
      const [user] = await sql`
        INSERT INTO users (firebase_uid, email, display_name, is_active)
        VALUES (
          ${fbUser.uid},
          ${email.trim().toLowerCase()},
          ${display_name?.trim() || null},
          TRUE
        )
        RETURNING id
      `;

      // Perfil mínimo — hereda timezone/currency/locale de la org
      await sql`
        INSERT INTO user_profile (user_id, timezone, currency, locale, onboarding_completed)
        VALUES (
          ${user.id},
          ${org.timezone ?? "America/Tegucigalpa"},
          ${org.currency ?? "HNL"},
          ${org.locale   ?? "es-HN"},
          TRUE
        )
      `;

      // Agregar como miembro de la org con el rol seleccionado
      [member] = await sql`
        INSERT INTO organization_members (org_id, user_id, role_id, joined_at)
        VALUES (${orgId}, ${user.id}, ${role_id}, NOW())
        RETURNING id
      `;
    } catch (pgError: any) {
      try { await adminAuth.deleteUser(fbUser.uid); } catch {}
      if (pgError?.code === "23505") {
        return createErrorResponse("Ya existe un usuario con ese email", 409);
      }
      throw pgError;
    }

    // Devolver el miembro completo
    const [result] = await sql`
      SELECT
        om.id, om.user_id, om.role_id, om.is_active, om.joined_at,
        u.email, u.display_name,
        r.name AS role_name, r.is_owner AS is_owner_role
      FROM organization_members om
      JOIN users     u ON u.id = om.user_id
      JOIN org_roles r ON r.id = om.role_id
      WHERE om.id = ${member.id}
    `;

    return Response.json({ data: result }, { status: 201 });
  } catch (error) {
    console.error("POST /api/organization/members/create-user:", error);
    return createErrorResponse("Error al crear usuario", 500);
  }
}
