// lib/auth.ts
import { NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

// ── Tipos ─────────────────────────────────────────────────────────────

export type OrgModule =
  | "DASHBOARD"
  | "PRODUCTS"
  | "INVENTORY"
  | "SALES"
  | "CUSTOMERS"
  | "FINANCES"
  | "EVENTS"
  | "REPORTS"
  | "ADMIN";

export type ModulePermissions = {
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  showCosts: boolean;
  showProfit: boolean;
};

export type AuthUser = {
  userId: number;
  orgId: number;
  roleId: number;
  roleName: string;
  isOwner: boolean; // true = bypass de permisos, acceso total
  firebaseUid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  isActive: boolean;
  subscription: {
    status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED";
    planSlug: string;
  };
};

type AuthResult =
  | { error: string; status: number; data: null; needsUpgrade?: boolean }
  | { error: null; status: 200; data: AuthUser; needsUpgrade?: never };

// ── verifyAuth ─────────────────────────────────────────────────────────

export async function verifyAuth(request: NextRequest): Promise<AuthResult> {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return { error: "No autorizado", status: 401, data: null };
  }

  const token = authHeader.substring(7);

  let decodedToken;
  try {
    decodedToken = await adminAuth.verifyIdToken(token);
  } catch {
    return { error: "Token inválido o expirado", status: 401, data: null };
  }

  try {
    const [row] = await sql`
      SELECT
        u.id                  AS user_id,
        u.firebase_uid,
        u.email,
        u.display_name,
        u.is_active,
        o.id                  AS org_id,
        o.owner_user_id,
        r.id                  AS role_id,
        r.name                AS role_name,
        r.is_owner            AS role_is_owner,
        os.status             AS subscription_status,
        sp.slug               AS plan_slug
      FROM users u
      JOIN organization_members om ON om.user_id   = u.id     AND om.is_active = TRUE
      JOIN organizations         o  ON o.id         = om.org_id AND o.is_active  = TRUE
      JOIN org_roles             r  ON r.id         = om.role_id
      JOIN org_subscriptions     os ON os.org_id    = o.id
      JOIN subscription_plans    sp ON sp.id        = os.plan_id
      WHERE u.firebase_uid = ${decodedToken.uid}
      ORDER BY om.joined_at ASC
      LIMIT 1
    `;

    if (!row) {
      return { error: "Usuario no encontrado", status: 404, data: null };
    }

    if (!row.is_active) {
      return { error: "Esta cuenta ha sido deshabilitada", status: 403, data: null };
    }

    const isOwner =
      row.role_is_owner === true || row.owner_user_id === row.user_id;

    return {
      error: null,
      status: 200,
      data: {
        userId: row.user_id,
        orgId: row.org_id,
        roleId: row.role_id,
        roleName: row.role_name,
        isOwner,
        firebaseUid: row.firebase_uid,
        email: row.email,
        displayName: row.display_name,
        emailVerified: decodedToken.email_verified ?? false,
        isActive: row.is_active,
        subscription: {
          status: row.subscription_status,
          planSlug: row.plan_slug,
        },
      },
    };
  } catch (error) {
    console.error("Error en verifyAuth:", error);
    return { error: "Error interno del servidor", status: 500, data: null };
  }
}

// ── verifySubscription ─────────────────────────────────────────────────

export async function verifySubscription(
  orgId: number
): Promise<
  | (AuthResult & { data: null })
  | { error: null; status: 200; isActive: true; planSlug: string }
> {
  try {
    const [subscription] = await sql`
      SELECT os.status, sp.slug AS plan_slug
      FROM org_subscriptions os
      JOIN subscription_plans sp ON sp.id = os.plan_id
      WHERE os.org_id = ${orgId}
    `;

    if (!subscription) {
      return { error: "Suscripción no encontrada", status: 404, data: null };
    }

    const validStatuses = ["TRIAL", "ACTIVE"];
    if (!validStatuses.includes(subscription.status)) {
      return {
        error: "Tu suscripción no está activa",
        status: 403,
        data: null,
        needsUpgrade: true,
      };
    }

    return { error: null, status: 200, isActive: true, planSlug: subscription.plan_slug };
  } catch (error) {
    console.error("Error en verifySubscription:", error);
    return { error: "Error al verificar suscripción", status: 500, data: null };
  }
}

// ── verifyFeatureAccess ────────────────────────────────────────────────

export async function verifyFeatureAccess(orgId: number, featureKey: string) {
  try {
    const [row] = await sql`
      SELECT
        sp.slug,
        EXISTS (
          SELECT 1
          FROM plan_features   pf
          JOIN system_features sf ON sf.id = pf.feature_id
          WHERE pf.plan_id     = os.plan_id
            AND sf.feature_key = ${featureKey}
            AND pf.is_enabled  = TRUE
            AND sf.is_active   = TRUE
        ) AS enabled
      FROM org_subscriptions os
      JOIN subscription_plans sp ON sp.id = os.plan_id
      WHERE os.org_id = ${orgId}
    `;

    // El plan admin siempre tiene acceso total
    if (row?.slug !== "admin" && !row?.enabled) {
      return {
        error: "Esta funcionalidad requiere un plan superior",
        status: 403,
        hasAccess: false,
        needsUpgrade: true,
      };
    }

    return { error: null, status: 200, hasAccess: true };
  } catch (error) {
    console.error("Error en verifyFeatureAccess:", error);
    return { error: "Error al verificar permisos", status: 500, hasAccess: false };
  }
}

// ── requireFeature ─────────────────────────────────────────────────────
// Devuelve Response 403 (con needs_upgrade) si el plan no tiene la feature,
// null si está OK. Uso: const deny = await requireFeature(orgId, 'reports.sales');
export async function requireFeature(
  orgId: number,
  featureKey: string
): Promise<Response | null> {
  const res = await verifyFeatureAccess(orgId, featureKey);
  if (!res.hasAccess) {
    return createErrorResponse(
      res.error ?? "Esta funcionalidad no está disponible en tu plan",
      res.status,
      "needsUpgrade" in res ? !!res.needsUpgrade : false
    );
  }
  return null;
}

// ── verifyModuleAccess ─────────────────────────────────────────────────
// Verifica que el rol del usuario tenga el permiso requerido en un módulo.
// El OWNER (isOwner=true) siempre tiene acceso total — no hace query a DB.

export async function verifyModuleAccess(
  auth: AuthUser,
  module: OrgModule,
  permission: keyof ModulePermissions
): Promise<{ allowed: boolean; error?: string }> {
  if (auth.isOwner) return { allowed: true };

  try {
    const [perm] = await sql`
      SELECT can_view, can_edit, can_delete, show_costs, show_profit
      FROM org_role_permissions
      WHERE role_id = ${auth.roleId} AND module = ${module}
    `;

    if (!perm) return { allowed: false, error: "Sin acceso a este módulo" };

    const map: Record<keyof ModulePermissions, boolean> = {
      canView:    perm.can_view,
      canEdit:    perm.can_edit,
      canDelete:  perm.can_delete,
      showCosts:  perm.show_costs,
      showProfit: perm.show_profit,
    };

    return { allowed: map[permission] };
  } catch (error) {
    console.error("Error en verifyModuleAccess:", error);
    return { allowed: false, error: "Error al verificar permisos" };
  }
}

// ── getModulePermissions ───────────────────────────────────────────────
// Devuelve todos los permisos de un módulo para un usuario.
// Útil en endpoints que necesitan condicionar qué datos retornan
// (ej: ocultar columna de costos si show_costs=false).

export async function getModulePermissions(
  auth: AuthUser,
  module: OrgModule
): Promise<ModulePermissions> {
  if (auth.isOwner) {
    return { canView: true, canEdit: true, canDelete: true, showCosts: true, showProfit: true };
  }

  try {
    const [perm] = await sql`
      SELECT can_view, can_edit, can_delete, show_costs, show_profit
      FROM org_role_permissions
      WHERE role_id = ${auth.roleId} AND module = ${module}
    `;

    if (!perm) {
      return { canView: false, canEdit: false, canDelete: false, showCosts: false, showProfit: false };
    }

    return {
      canView:    perm.can_view,
      canEdit:    perm.can_edit,
      canDelete:  perm.can_delete,
      showCosts:  perm.show_costs,
      showProfit: perm.show_profit,
    };
  } catch {
    return { canView: false, canEdit: false, canDelete: false, showCosts: false, showProfit: false };
  }
}

// ── verifyResourceLimit ────────────────────────────────────────────────

export async function verifyResourceLimit(
  orgId: number,
  resourceType: "products" | "sales" | "transactions" | "accounts" | "supplies"
) {
  try {
    const limits: Record<string, { column: string; countQuery: () => Promise<number> }> = {
      products: {
        column: "max_products",
        countQuery: async () => {
          const [r] = await sql`
            SELECT COUNT(*) AS count FROM products
            WHERE org_id = ${orgId} AND is_active = TRUE
          `;
          return Number(r.count);
        },
      },
      sales: {
        column: "max_sales_per_month",
        countQuery: async () => {
          const [r] = await sql`
            SELECT COUNT(*) AS count FROM sales
            WHERE org_id = ${orgId}
              AND DATE_TRUNC('month', sold_at) = DATE_TRUNC('month', NOW())
          `;
          return Number(r.count);
        },
      },
      transactions: {
        column: "max_transactions_per_month",
        countQuery: async () => {
          const [r] = await sql`
            SELECT COUNT(*) AS count FROM transactions
            WHERE org_id = ${orgId}
              AND DATE_TRUNC('month', occurred_at) = DATE_TRUNC('month', NOW())
          `;
          return Number(r.count);
        },
      },
      accounts: {
        column: "max_accounts",
        countQuery: async () => {
          const [r] = await sql`
            SELECT COUNT(*) AS count FROM accounts
            WHERE org_id = ${orgId} AND is_active = TRUE
          `;
          return Number(r.count);
        },
      },
      supplies: {
        column: "max_supplies",
        countQuery: async () => {
          const [r] = await sql`
            SELECT COUNT(*) AS count FROM supplies
            WHERE org_id = ${orgId}
          `;
          return Number(r.count);
        },
      },
    };

    const [plan] = await sql`
      SELECT sp.max_products, sp.max_sales_per_month, sp.max_transactions_per_month,
             sp.max_accounts, sp.max_supplies
      FROM org_subscriptions os
      JOIN subscription_plans sp ON sp.id = os.plan_id
      WHERE os.org_id = ${orgId}
    `;

    if (!plan) {
      return { error: "Plan no encontrado", status: 404, withinLimit: false };
    }

    const limitValue = plan[limits[resourceType].column];

    if (limitValue === null) {
      return { error: null, status: 200, withinLimit: true };
    }

    const currentCount = await limits[resourceType].countQuery();

    if (currentCount >= limitValue) {
      const messages = {
        products: "Has alcanzado el límite de productos para tu plan",
        sales: "Has alcanzado el límite de ventas mensuales para tu plan",
        transactions: "Has alcanzado el límite de transacciones mensuales para tu plan",
        accounts: "Has alcanzado el límite de cuentas para tu plan",
        supplies: "Has alcanzado el límite de suministros para tu plan",
      };

      return {
        error: messages[resourceType],
        status: 403,
        withinLimit: false,
        needsUpgrade: true,
      };
    }

    return { error: null, status: 200, withinLimit: true };
  } catch (error) {
    console.error("Error en verifyResourceLimit:", error);
    return { error: "Error al verificar límites", status: 500, withinLimit: false };
  }
}

// ── getOrgTimezone ─────────────────────────────────────────────────────
// Helper para routes que necesitan el timezone de la org (reemplaza la
// consulta a user_profile que usaban antes de la migración multi-org).

export async function getOrgTimezone(orgId: number): Promise<string> {
  try {
    const [org] = await sql`
      SELECT timezone FROM organizations WHERE id = ${orgId}
    `;
    return org?.timezone ?? "America/Tegucigalpa";
  } catch {
    return "America/Tegucigalpa";
  }
}

// ── verifyAuthAndSubscription (helper combinado) ───────────────────────

export async function verifyAuthAndSubscription(request: NextRequest): Promise<AuthResult> {
  const authResult = await verifyAuth(request);
  if (authResult.error !== null) return authResult;

  const subResult = await verifySubscription(authResult.data.orgId);
  if (subResult.error !== null) {
    return {
      error: subResult.error,
      status: subResult.status,
      data: null,
      needsUpgrade: "needsUpgrade" in subResult ? subResult.needsUpgrade : false,
    };
  }

  return authResult;
}

// ── verifyAdmin ────────────────────────────────────────────────────────

export async function verifyAdmin(request: NextRequest): Promise<AuthResult> {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return auth;
  if (auth.data.subscription.planSlug !== "admin") {
    return { error: "Acceso denegado — se requiere rol de administrador", status: 403, data: null };
  }
  return auth;
}

// ── ensureOrgExists ────────────────────────────────────────────────────
// Crea org + rol OWNER + membership + suscripción para un usuario nuevo.
// Se usa en el flujo de onboarding y como fallback en login si no tiene org.

export async function ensureOrgExists(
  userId: number,
  orgName: string,
  timezone = "America/Tegucigalpa",
  currency = "HNL",
  locale = "es-HN"
): Promise<{ orgId: number; roleId: number; roleName: string }> {
  const [existing] = await sql`
    SELECT om.org_id, r.id AS role_id, r.name AS role_name
    FROM organization_members om
    JOIN organizations o ON o.id = om.org_id AND o.is_active = TRUE
    JOIN org_roles     r ON r.id = om.role_id
    WHERE om.user_id = ${userId} AND om.is_active = TRUE
    ORDER BY om.joined_at ASC
    LIMIT 1
  `;

  if (existing) {
    return { orgId: existing.org_id, roleId: existing.role_id, roleName: existing.role_name };
  }

  const slug =
    orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + userId;

  const [org] = await sql`
    INSERT INTO organizations (name, slug, timezone, currency, locale, owner_user_id)
    VALUES (${orgName}, ${slug}, ${timezone}, ${currency}, ${locale}, ${userId})
    RETURNING id
  `;

  const [ownerRole] = await sql`
    INSERT INTO org_roles (org_id, name, is_owner)
    VALUES (${org.id}, 'Dueño', TRUE)
    RETURNING id, name
  `;

  // Permisos totales para el rol dueño
  await sql`
    INSERT INTO org_role_permissions (role_id, module, can_view, can_edit, can_delete, show_costs, show_profit)
    SELECT ${ownerRole.id}, m.module, TRUE, TRUE, TRUE, TRUE, TRUE
    FROM (VALUES
      ('DASHBOARD'), ('PRODUCTS'), ('INVENTORY'), ('SALES'), ('CUSTOMERS'),
      ('FINANCES'), ('EVENTS'), ('REPORTS'), ('ADMIN')
    ) AS m(module)
  `;

  await sql`
    INSERT INTO organization_members (org_id, user_id, role_id, joined_at)
    VALUES (${org.id}, ${userId}, ${ownerRole.id}, NOW())
  `;

  const [plan] = await sql`
    SELECT id FROM subscription_plans WHERE slug = 'trial' LIMIT 1
  `;

  if (plan) {
    await sql`
      INSERT INTO org_subscriptions (org_id, plan_id, status, trial_start_date, trial_end_date)
      VALUES (
        ${org.id}, ${plan.id}, 'TRIAL',
        NOW(), NOW() + INTERVAL '30 days'
      )
      ON CONFLICT (org_id) DO NOTHING
    `;
  }

  return { orgId: org.id, roleId: ownerRole.id, roleName: ownerRole.name };
}

// ── requireModule ──────────────────────────────────────────────────────
// Devuelve Response 403 si el rol no tiene el permiso, null si está OK.
// Uso: const deny = await requireModule(auth.data, 'SALES', 'canEdit');
//      if (deny) return deny;
export async function requireModule(
  auth: AuthUser,
  module: OrgModule,
  permission: keyof ModulePermissions
): Promise<Response | null> {
  if (auth.isOwner) return null;
  const { allowed, error } = await verifyModuleAccess(auth, module, permission);
  if (!allowed) return createErrorResponse(error ?? "Sin acceso a este módulo", 403);
  return null;
}

// ── nullifyKeysDeep ────────────────────────────────────────────────────
// Pone en null (recursivamente) las claves indicadas de un payload.
// Se usa para aplicar show_costs / show_profit del rol sin reescribir
// cada query: el cliente ya oculta las columnas, esto evita que los
// valores viajen en la respuesta.
export function nullifyKeysDeep<T>(value: T, keys: ReadonlySet<string>): T {
  if (Array.isArray(value)) {
    for (const item of value) nullifyKeysDeep(item, keys);
  } else if (value !== null && typeof value === "object") {
    for (const k of Object.keys(value)) {
      if (keys.has(k)) {
        (value as Record<string, unknown>)[k] = null;
      } else {
        nullifyKeysDeep((value as Record<string, unknown>)[k], keys);
      }
    }
  }
  return value;
}

// ── createErrorResponse ────────────────────────────────────────────────

export function createErrorResponse(
  error: string,
  status: number,
  needsUpgrade: boolean = false
) {
  return Response.json(
    { error, ...(needsUpgrade && { needs_upgrade: true }) },
    { status }
  );
}

// ── isAuthSuccess ──────────────────────────────────────────────────────

export function isAuthSuccess(
  result: Awaited<ReturnType<typeof verifyAuth>>
): result is { error: null; status: 200; data: AuthUser } {
  return result.error === null;
}
