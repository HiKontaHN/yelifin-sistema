// proxy.ts
import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["", "/login", "/register", "/forgot-password"];
const AUTH_ONLY_PATHS = ["/verify-email", "/onboarding"];

type VerifiedTokenPayload = {
  aud?: string;
  exp?: number;
  email_verified?: boolean;
  [key: string]: any;
};

type VerifiedTokenResult =
  | { valid: true; payload: VerifiedTokenPayload }
  | { valid: false };

// ── Verificación JWT manual (Edge-compatible) ──────────────────────────
// Firebase ID tokens son JWTs firmados con RS256 por Google
async function verifyFirebaseToken(token: string): Promise<VerifiedTokenResult> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return { valid: false };

    const [headerB64, payloadB64, signatureB64] = parts;

    const header = JSON.parse(
      atob(headerB64.replace(/-/g, "+").replace(/_/g, "/"))
    );
    const payload: VerifiedTokenPayload = JSON.parse(
      atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"))
    );

    const now = Math.floor(Date.now() / 1000);

    if (!payload.exp || payload.exp < now) return { valid: false };
    if (payload.aud !== process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
      return { valid: false };
    }

    const keysRes = await fetch(
      "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com",
      { next: { revalidate: 3600 } }
    );

    if (!keysRes.ok) return { valid: false };

    const keys = await keysRes.json();
    const certPem = keys[header.kid];
    if (!certPem) return { valid: false };

    const certDer = pemToDer(certPem);
    const cryptoKey = await crypto.subtle.importKey(
      "spki",
      certDer,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signature = base64UrlDecode(signatureB64);

    const isValid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      signature,
      data
    );

    if (!isValid) return { valid: false };

    return { valid: true, payload };
  } catch {
    return { valid: false };
  }
}

function pemToDer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN CERTIFICATE-----/, "")
    .replace(/-----END CERTIFICATE-----/, "")
    .replace(/\s/g, "");

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

function base64UrlDecode(str: string): ArrayBuffer {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "="
  );

  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
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

const SESSION_COOKIE = "hikonta_session";
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
  token: string,
  requestUrl: string
): Promise<{ onboarding_completed: boolean; plan_slug: string | null } | null> {
  try {
    const res = await fetch(new URL("/api/onboarding", requestUrl), {
      headers: { Authorization: `Bearer ${token}` },
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

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/auth/action") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get("token")?.value;

  const isPublic   = PUBLIC_PATHS.some((p) =>
    p === "" ? pathname === "/" : pathname.startsWith(p)
  );
  const isAuthOnly = AUTH_ONLY_PATHS.some((p) => pathname.startsWith(p));

  // Sin cookie → dejar pasar (el cliente mostrará login)
  if (!token) return NextResponse.next();

  const result = await verifyFirebaseToken(token);

  // Token inválido → tratar como sin sesión
  if (!result.valid) return NextResponse.next();

  const emailVerified = result.payload.email_verified === true;

  // No verificado → solo /verify-email
  if (!emailVerified) {
    if (!pathname.startsWith("/verify-email")) {
      return NextResponse.redirect(new URL("/verify-email", request.url));
    }
    return NextResponse.next();
  }

  const uid = typeof result.payload.sub === "string" ? result.payload.sub : "";

  // Verificado, rutas públicas o /verify-email → revisar onboarding y redirigir
  if (isPublic || pathname.startsWith("/verify-email")) {
    const cached  = readSessionCookie(request, uid);
    const session = cached ?? (await fetchSession(token, request.url));

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
    const session = cached ?? (await fetchSession(token, request.url));

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