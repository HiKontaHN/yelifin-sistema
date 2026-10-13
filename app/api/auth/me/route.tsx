// app/api/auth/me/route.ts
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { adminAuth } from "@/lib/firebase-admin";
import { verifyAuth, createErrorResponse, isAuthSuccess } from "@/lib/auth";
import { MODULES, MODULE_SUBITEMS } from "@/lib/permissions";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get("hikonta_auth")?.value;
    if (!sessionCookie) {
      return createErrorResponse("No autorizado", 401);
    }

    let decoded;
    try {
      decoded = await adminAuth.verifySessionCookie(sessionCookie);
    } catch {
      return createErrorResponse("Token inválido o expirado", 401);
    }

    // La cuenta de Firebase y el perfil consolidado se consultan en paralelo.
    // Esto conserva la detección de usuarios deshabilitados y evita el viaje
    // adicional a Neon que antes realizaba verifyAuth antes de esta consulta.
    const [firebaseUser, rows] = await Promise.all([
      adminAuth.getUser(decoded.uid).catch(() => null),
      sql`
      SELECT
        u.id,
        u.firebase_uid,
        u.email,
        u.display_name,
        u.photo_url,
        u.is_active,
        u.created_at,

        up.business_name,
        up.business_logo_url,
        up.onboarding_completed,

        o.id            AS org_id,
        o.name          AS org_name,
        o.slug          AS org_slug,
        o.logo_url      AS org_logo_url,
        o.timezone,
        o.currency,
        o.locale,
        o.industry_id,
        o.owner_user_id,

        r.id            AS role_id,
        r.name          AS role_name,
        r.is_owner      AS role_is_owner,

        os.id                   AS subscription_id,
        os.status               AS subscription_status,
        os.current_period_start,
        os.current_period_end,
        os.cancel_at_period_end,

        sp.id               AS plan_id,
        sp.name             AS plan_name,
        sp.slug             AS plan_slug,
        sp.price_usd,
        sp.billing_interval,
        sp.max_products,
        sp.max_sales_per_month,
        sp.max_storage_mb,

        COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'key', sf.feature_key,
              'name', sf.feature_name,
              'category', sf.category
            )
            ORDER BY sf.category, sf.feature_key
          )
          FROM plan_features pf
          JOIN system_features sf ON sf.id = pf.feature_id
          WHERE pf.plan_id = os.plan_id
            AND os.status IN ('TRIAL', 'ACTIVE')
            AND pf.is_enabled = TRUE
            AND sf.is_active = TRUE
        ), '[]'::jsonb) AS plan_features,

        COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'module', orp.module,
              'subitem', orp.subitem,
              'can_view', orp.can_view,
              'can_edit', orp.can_edit,
              'can_delete', orp.can_delete,
              'show_costs', orp.show_costs,
              'show_profit', orp.show_profit
            )
            ORDER BY orp.module, orp.subitem
          )
          FROM org_role_permissions orp
          WHERE orp.role_id = r.id
        ), '[]'::jsonb) AS role_permissions

      FROM users u
      LEFT JOIN user_profile      up ON up.user_id  = u.id
      JOIN  organization_members  om ON om.user_id  = u.id  AND om.is_active = TRUE
      JOIN  organizations         o  ON o.id        = om.org_id AND o.is_active = TRUE
      JOIN  org_roles             r  ON r.id        = om.role_id
      JOIN  org_subscriptions     os ON os.org_id   = o.id
      JOIN  subscription_plans    sp ON sp.id       = os.plan_id
      WHERE u.firebase_uid = ${decoded.uid}
      ORDER BY om.joined_at ASC
      LIMIT 1
      `,
    ]);

    if (!firebaseUser || firebaseUser.disabled) {
      return createErrorResponse("Cuenta deshabilitada o inexistente", 401);
    }

    const [row] = rows;

    if (!row) {
      return Response.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    if (!row.is_active) {
      return createErrorResponse("Esta cuenta ha sido deshabilitada", 403);
    }

    const featureRows = Array.isArray(row.plan_features) ? row.plan_features : [];
    const featuresByCategory = featureRows.reduce((acc: Record<string, any[]>, feature: any) => {
      if (!acc[feature.category]) acc[feature.category] = [];
      acc[feature.category].push(feature);
      return acc;
    }, {});

    // Permisos por módulo del rol actual
    const isOwner = row.role_is_owner === true || row.owner_user_id === row.id;

    // Permisos anidados por módulo y luego por subitem — ver
    // lib/permissions.ts (MODULE_SUBITEMS) para el catálogo completo.
    let permissionsMap: Record<string, Record<string, object>>;

    if (isOwner) {
      permissionsMap = Object.fromEntries(
        MODULES.map((m) => [m, Object.fromEntries(
          MODULE_SUBITEMS[m].map(({ code }) => [code, {
            can_view: true, can_edit: true, can_delete: true,
            show_costs: true, show_profit: true,
          }])
        )])
      );
    } else {
      permissionsMap = {};
      const permissionRows = Array.isArray(row.role_permissions) ? row.role_permissions : [];
      for (const p of permissionRows) {
        (permissionsMap[p.module] ??= {})[p.subitem] = {
          can_view: p.can_view, can_edit: p.can_edit, can_delete: p.can_delete,
          show_costs: p.show_costs, show_profit: p.show_profit,
        };
      }
    }

    return Response.json({
      session: {
        uid:                  firebaseUser.uid,
        email:                firebaseUser.email ?? null,
        displayName:          firebaseUser.displayName ?? null,
        emailVerified:        firebaseUser.emailVerified,
        sessionEmailVerified: decoded.email_verified === true,
      },
      user: {
        id:           row.id,
        firebase_uid: row.firebase_uid,
        email:        row.email,
        display_name: row.display_name,
        photo_url:    row.photo_url,
        is_active:    row.is_active,
        created_at:   row.created_at,
      },
      profile: {
        user_id:              row.id,
        business_name:        row.business_name,
        business_logo_url:    row.business_logo_url,
        timezone:             row.timezone ?? "America/Tegucigalpa",
        currency:             row.currency ?? "HNL",
        locale:               row.locale   ?? "es-HN",
        onboarding_completed: row.onboarding_completed ?? false,
      },
      org: {
        id:          row.org_id,
        name:        row.org_name,
        slug:        row.org_slug,
        logo_url:    row.org_logo_url,
        timezone:    row.timezone ?? "America/Tegucigalpa",
        currency:    row.currency ?? "HNL",
        locale:      row.locale   ?? "es-HN",
        industry_id: row.industry_id ?? null,
      },
      role: {
        id:       row.role_id,
        name:     row.role_name,
        is_owner: isOwner,
      },
      permissions: permissionsMap,
      subscription: {
        id:                   row.subscription_id,
        status:               row.subscription_status,
        plan: {
          id:               row.plan_id,
          name:             row.plan_name,
          slug:             row.plan_slug,
          price_usd:        row.price_usd,
          billing_interval: row.billing_interval,
          limits: {
            max_products:        row.max_products,
            max_sales_per_month: row.max_sales_per_month,
            max_storage_mb:      row.max_storage_mb,
          },
        },
        current_period_start: row.current_period_start,
        current_period_end:   row.current_period_end,
        cancel_at_period_end: row.cancel_at_period_end,
      },
      features: featuresByCategory,
    });
  } catch (error: any) {
    console.error("Error en /api/auth/me:", error);
    return Response.json({ error: "Error al obtener información del usuario" }, { status: 500 });
  }
}

// ── PATCH /api/auth/me — actualizar perfil de usuario ─────────────────────────
export async function PATCH(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);

  try {
    const { userId } = auth.data;
    const body = await request.json() as Record<string, unknown>;
    const has = (k: string) => k in body;

    if (has("display_name")) {
      const val = typeof body.display_name === "string" ? body.display_name.trim() || null : null;
      await sql`UPDATE users SET display_name = ${val}, updated_at = NOW() WHERE id = ${userId}`;
    }

    const patchProfile =
      has("business_name") || has("business_logo_url") ||
      has("timezone")      || has("currency")           || has("locale");

    if (patchProfile) {
      const [current] = await sql`
        SELECT business_name, business_logo_url, timezone, currency, locale
        FROM user_profile WHERE user_id = ${userId}
      `;

      const business_name     = has("business_name")     ? (body.business_name     as string | null) : current?.business_name;
      const business_logo_url = has("business_logo_url") ? (body.business_logo_url as string | null) : current?.business_logo_url;
      const timezone          = has("timezone")          ? (body.timezone          as string)        : current?.timezone;
      const currency          = has("currency")          ? (body.currency          as string)        : current?.currency;
      const locale            = has("locale")            ? (body.locale            as string)        : current?.locale;

      await sql`
        UPDATE user_profile
        SET
          business_name     = ${business_name     ?? null},
          business_logo_url = ${business_logo_url ?? null},
          timezone          = ${timezone          ?? "America/Tegucigalpa"},
          currency          = ${currency          ?? "HNL"},
          locale            = ${locale            ?? "es-HN"},
          updated_at        = NOW()
        WHERE user_id = ${userId}
      `;
    }

    return Response.json({ message: "Perfil actualizado exitosamente" });
  } catch (error: any) {
    console.error("PATCH /api/auth/me:", error);
    return createErrorResponse("Error al actualizar el perfil", 500);
  }
}
