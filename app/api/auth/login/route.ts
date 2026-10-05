// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { neon } from "@neondatabase/serverless";
import { rateLimit, getClientIP } from "@/lib/rate-limit";
import { ensureOrgExists } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);
const SESSION_COOKIE = "hikonta_auth";
const SESSION_MAX_AGE = 60 * 60 * 24 * 5;

export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin) {
    return NextResponse.json({ error: "Origen no autorizado" }, { status: 403 });
  }

  // 5 intentos por IP cada 15 minutos
  const { allowed, remaining, retryAfterSec } = rateLimit(
    `login:${getClientIP(req)}`,
    5,
    15 * 60 * 1000,
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera unos minutos e intenta de nuevo." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSec),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  try {
    const { idToken } = await req.json();

    if (!idToken) {
      return NextResponse.json(
        { error: "Token requerido" },
        { status: 400 }
      );
    }

    // 1. Verificar el token con Firebase Admin
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch {
      return NextResponse.json(
        { error: "Token inválido o expirado" },
        { status: 401 }
      );
    }

    // Solo permitir crear una sesión tras una autenticación reciente;
    // un ID token renovado en segundo plano no debe extender los 5 días.
    if (Date.now() / 1000 - decodedToken.auth_time > 5 * 60) {
      return NextResponse.json(
        { error: "Inicia sesión nuevamente para crear una sesión" },
        { status: 401 }
      );
    }

    const { uid, email } = decodedToken;

    // 2. Verificar que el usuario existe en PostgreSQL y está activo
    const [user] = await sql`
      SELECT
        u.id,
        u.firebase_uid,
        u.email,
        u.display_name,
        u.is_active,
        up.business_name,
        up.timezone,
        up.currency,
        up.locale
      FROM users u
      LEFT JOIN user_profile up ON up.user_id = u.id
      WHERE u.firebase_uid = ${uid}
      LIMIT 1
    `;

    if (!user || !user.is_active) {
      return NextResponse.json(
        { error: "Credenciales inválidas" },
        { status: 401 }
      );
    }

    // 2.5. Cuentas de HiKonta Partners (coordinadores de incubadora) usan el
    // mismo proyecto de Firebase pero viven en `partners`, no en
    // `organization_members` — nunca deben pasar de acá. Sin este corte,
    // ensureOrgExists() de abajo (su fallback de migración "crea una org si
    // no tiene") le provisionaría un negocio + trial de 30 días a una
    // cuenta que no es de un emprendedor.
    const [partner] = await sql`SELECT id FROM partners WHERE user_id = ${user.id} LIMIT 1`;
    if (partner) {
      return NextResponse.json(
        { error: "Esta cuenta es de HiKonta Partners — inicia sesión en partners.hikonta.com" },
        { status: 403 }
      );
    }

    // 3. Asegurar que el usuario tiene org (crea una si no tiene — fallback de migración)
    const { orgId, roleName } = await ensureOrgExists(
      user.id,
      user.business_name || user.display_name || user.email,
      user.timezone  || "America/Tegucigalpa",
      user.currency  || "HNL",
      user.locale    || "es-HN"
    );

    // 4. Obtener suscripción de la org
    const [orgSub] = await sql`
      SELECT os.status, sp.slug AS plan_slug
      FROM org_subscriptions os
      JOIN subscription_plans sp ON sp.id = os.plan_id
      WHERE os.org_id = ${orgId}
    `;

    // 5. Construir respuesta JSON
    const response = NextResponse.json({
      message: "Login exitoso",
      data: {
        user: {
          id: user.id,
          firebase_uid: user.firebase_uid,
          email: user.email,
          display_name: user.display_name,
          business_name: user.business_name,
        },
        org: {
          id: orgId,
          role: roleName,
        },
        subscription: {
          status: orgSub?.status ?? "TRIAL",
          plan: orgSub?.plan_slug ?? "trial",
        },
      },
    });

    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: SESSION_MAX_AGE * 1000,
    });
    response.cookies.set(SESSION_COOKIE, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    response.cookies.set("token", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    response.cookies.set("hikonta_session", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error: any) {
    console.error(" Error en login:", error);
    return NextResponse.json(
      { error: "Error al iniciar sesión. Por favor intenta de nuevo." },
      { status: 500 }
    );
  }
}
