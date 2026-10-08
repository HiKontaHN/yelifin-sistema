// proxy.ts
import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIP } from "@/lib/rate-limit";
import { adminAuth } from "@/lib/firebase-admin";
import { withDevelopmentCors } from "@/lib/request-origin";

const PUBLIC_PATHS = ["", "/login", "/register", "/forgot-password"];
const AUTH_ONLY_PATHS = ["/verify-email", "/onboarding"];

function clearLegacyTokenCookie(response: NextResponse) {
  response.cookies.set("token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

// ── Plan routing rules ────────────────────────────────────────────────
const ADMIN_ROUTES = ["/admin"];

// Restricted plans: slug → allowed path prefixes (no /dashboard for finanzas)
const RESTRICTED_PLANS: Record<string, string[]> = {
  finanzas: ["/finances", "/settings"],
};

// Default landing page per plan after login
const PLAN_HOME: Record<string, string> = {
  finanzas: "/finances",
};

function getHome(planSlug: string | null): string {
  return (planSlug && PLAN_HOME[planSlug]) ?? "/dashboard";
}

function enforcePlanRules(
  pathname: string,
  planSlug: string | null,
  requestUrl: string
): NextResponse | null {
  // 1. Admin-only routes
  if (ADMIN_ROUTES.some((r) => pathname.startsWith(r))) {
    if (planSlug !== "admin") {
      return NextResponse.redirect(new URL(getHome(planSlug), requestUrl));
    }
  }

  // 2. Restricted-plan routes
  if (planSlug && planSlug in RESTRICTED_PLANS) {
    const allowed = RESTRICTED_PLANS[planSlug];
    const canAccess = allowed.some((prefix) => pathname.startsWith(prefix));
    if (!canAccess) {
      return NextResponse.redirect(new URL(getHome(planSlug), requestUrl));
    }
  }

  return null;
}

// ── Session cache en cookie ────────────────────────────────────────────
// Evita llamar a /api/onboarding (verificación Firebase Admin + JOIN pesado)
// en cada navegación. Solo se cachean sesiones con onboarding completo,
// ligadas al uid del token para no arrastrar datos de otro usuario.
// El POST /api/onboarding también setea esta cookie al completar.

const SESSION_COOKIE = "hikonta_nav";
const SESSION_TTL = 600; // 10 minutos

type Session = { onboarding_completed: boolean; plan_slug: string | null };

function readSessionCookie(request: NextRequest, uid: string): Session | null {
  const raw = request.cookies.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const [flag, planSlug, cookieUid] = raw.split("|");
  if (flag !== "1" || cookieUid !== uid) return null;
  return { onboarding_completed: true, plan_slug: planSlug || null };
}

function attachSessionCookie(res: NextResponse, session: Session, uid: string) {
  if (!session.onboarding_completed) return;
  res.cookies.set(SESSION_COOKIE, `1|${session.plan_slug ?? ""}|${uid}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
    secure: process.env.NODE_ENV === "production",
  });
}

// ── Session helper (calls /api/onboarding, returns plan info) ──────────
async function fetchSession(
  sessionCookie: string,
  requestUrl: string
): Promise<{ onboarding_completed: boolean; plan_slug: string | null } | null> {
  try {
    const res = await fetch(new URL("/api/onboarding", requestUrl), {
      headers: { Cookie: `hikonta_auth=${sessionCookie}` },
    });
    if (!res.ok) return null;
    const body = await res.json();
    return {
      onboarding_completed: body?.data?.onboarding_completed ?? false,
      plan_slug:            body?.data?.plan_slug ?? null,
    };
  } catch {
    return null;
  }
}

// ── Middleware ─────────────────────────────────────────────────────────
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Rate limit global para toda la API ─────────────────────────────
  // Protección base anti-abuso/DoS por IP para /api/*. Endpoints sensibles
  // (login, register) aplican además su propio límite más estricto dentro
  // del route handler. In-memory por instancia — ver lib/rate-limit.ts.
  if (pathname.startsWith("/api")) {
    // Responder el preflight sin consumir el límite ni requerir una sesión.
    if (process.env.NODE_ENV === "development" && request.method === "OPTIONS") {
      return withDevelopmentCors(request, new NextResponse(null, { status: 204 }));
    }

    const { allowed, retryAfterSec } = rateLimit(
      `api:${getClientIP(request)}`,
      300,
      60 * 1000, // 300 solicitudes por minuto por IP
    );
    if (!allowed) {
      return withDevelopmentCors(
        request,
        NextResponse.json(
          { error: "Demasiadas solicitudes. Intenta de nuevo en unos segundos." },
          {
            status: 429,
            headers: { "Retry-After": String(retryAfterSec) },
          },
        ),
      );
    }
    const response = NextResponse.next();
    if (request.cookies.has("token")) clearLegacyTokenCookie(response);
    return withDevelopmentCors(request, response);
  }

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/auth/action") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get("hikonta_auth")?.value;

  const isPublic   = PUBLIC_PATHS.some((p) =>
    p === "" ? pathname === "/" : pathname.startsWith(p)
  );
  const isAuthOnly = AUTH_ONLY_PATHS.some((p) => pathname.startsWith(p));

  if (!sessionCookie) {
    const response = NextResponse.next();
    if (request.cookies.has("token")) clearLegacyTokenCookie(response);
    return response;
  }

  let decodedToken;
  try {
    decodedToken = await adminAuth.verifySessionCookie(sessionCookie);
  } catch {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("hikonta_auth");
    response.cookies.delete("hikonta_nav");
    return response;
  }

  const uid = decodedToken.uid;

  // Email verification is enforced by the authenticated dashboard layout.
  // Firebase session cookies keep the email_verified claim from sign-in time.
  if (pathname.startsWith("/verify-email")) return NextResponse.next();

  // Rutas públicas → revisar onboarding y redirigir
  if (isPublic) {
    const cached  = readSessionCookie(request, uid);
    const session = cached ?? (await fetchSession(sessionCookie, request.url));

    if (session && !session.onboarding_completed) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }
    const res = NextResponse.redirect(new URL(getHome(session?.plan_slug ?? null), request.url));
    if (session && !cached) attachSessionCookie(res, session, uid);
    return res;
  }

  // Rutas privadas (no authOnly) → verificar onboarding + plan rules
  if (!isAuthOnly) {
    const cached  = readSessionCookie(request, uid);
    const session = cached ?? (await fetchSession(sessionCookie, request.url));

    if (session && !session.onboarding_completed) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }

    const planRedirect = session
      ? enforcePlanRules(pathname, session.plan_slug, request.url)
      : null;

    const res = planRedirect ?? NextResponse.next();
    if (session && !cached) attachSessionCookie(res, session, uid);
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
