// app/api/auth/me/route.ts
import { NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess } from "@/lib/auth";
import { MODULES, MODULE_SUBITEMS } from "@/lib/permissions";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const token = authHeader.substring(7);
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(token);
    } catch {
      return Response.json({ error: "Token inválido o expirado" }, { status: 401 });
    }

    // Usuario + org + rol + suscripción en un solo query
    const [row] = await sql`
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
        sp.max_storage_mb

      FROM users u
      LEFT JOIN user_profile      up ON up.user_id  = u.id
      JOIN  organization_members  om ON om.user_id  = u.id  AND om.is_active = TRUE
      JOIN  organizations         o  ON o.id        = om.org_id AND o.is_active = TRUE
      JOIN  org_roles             r  ON r.id        = om.role_id
      JOIN  org_subscriptions     os ON os.org_id   = o.id
      JOIN  subscription_plans    sp ON sp.id       = os.plan_id
      WHERE u.firebase_uid = ${decodedToken.uid}
        AND u.is_active    = TRUE
      ORDER BY om.joined_at ASC
      LIMIT 1
    `;

    if (!row) {
      return Response.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    // Features del plan
    const features = await sql`
      SELECT sf.feature_key, sf.feature_name, sf.category
      FROM org_subscriptions os
      JOIN plan_features  pf ON pf.plan_id = os.plan_id
      JOIN system_features sf ON sf.id = pf.feature_id
      WHERE os.org_id = ${row.org_id}
        AND os.status IN ('TRIAL', 'ACTIVE')
        AND pf.is_enabled = TRUE
        AND sf.is_active  = TRUE
    `;

    const featuresByCategory = features.reduce((acc: Record<string, any[]>, f) => {
      if (!acc[f.category]) acc[f.category] = [];
      acc[f.category].push({ key: f.feature_key, name: f.feature_name, category: f.category });
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
      const perms = await sql`
        SELECT module, subitem, can_view, can_edit, can_delete, show_costs, show_profit
        FROM org_role_permissions
        WHERE role_id = ${row.role_id}
      `;
      permissionsMap = {};
      for (const p of perms) {
        (permissionsMap[p.module] ??= {})[p.subitem] = {
          can_view: p.can_view, can_edit: p.can_edit, can_delete: p.can_delete,
          show_costs: p.show_costs, show_profit: p.show_profit,
        };
      }
    }

    return Response.json({
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
