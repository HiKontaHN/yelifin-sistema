import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { neon } from "@neondatabase/serverless";
import { hasValidRequestOrigin } from "@/lib/request-origin";

const sql = neon(process.env.DATABASE_URL!);
const SESSION_COOKIE = "hikonta_auth";
const SESSION_MAX_AGE = 60 * 60 * 24 * 5;

export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
    if (!sessionCookie) return NextResponse.json({ error: "Sesión ausente" }, { status: 401 });

    const decoded = await adminAuth.verifySessionCookie(sessionCookie);
    const user = await adminAuth.getUser(decoded.uid);
    if (user.disabled) return NextResponse.json({ error: "Cuenta deshabilitada" }, { status: 401 });

    return NextResponse.json({
      uid: user.uid,
      email: user.email ?? null,
      displayName: user.displayName ?? null,
      emailVerified: user.emailVerified,
      sessionEmailVerified: decoded.email_verified === true,
    });
  } catch {
    return NextResponse.json({ error: "Sesión inválida o expirada" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  if (!hasValidRequestOrigin(request)) {
    return NextResponse.json({ error: "Origen no autorizado" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const idToken = body?.idToken;
  if (typeof idToken !== "string" || !idToken) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    // Evita que un ID token renovado en segundo plano se use para extender
    // una cookie de sesión vencida sin que el usuario vuelva a autenticarse.
    if (Date.now() / 1000 - decoded.auth_time > 5 * 60) {
      return NextResponse.json(
        { error: "Inicia sesión nuevamente para crear una sesión" },
        { status: 401 }
      );
    }

    const [user] = await sql`
      SELECT is_active FROM users WHERE firebase_uid = ${decoded.uid} LIMIT 1
    `;

    if (!user?.is_active) {
      return NextResponse.json({ error: "Cuenta no autorizada" }, { status: 403 });
    }

    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: SESSION_MAX_AGE * 1000,
    });
    const response = NextResponse.json({ ok: true });
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
  } catch {
    return NextResponse.json({ error: "Token inválido o expirado" }, { status: 401 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!hasValidRequestOrigin(request)) {
    return NextResponse.json({ error: "Origen no autorizado" }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set("hikonta_nav", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
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
}
