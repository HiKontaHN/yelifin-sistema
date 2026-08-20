// app/api/auth/register/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { neon } from "@neondatabase/serverless";
import { seedDefaultCategories } from "@/lib/seed-default-categories";
import { rateLimit, getClientIP } from "@/lib/rate-limit";
import { ensureOrgExists } from "@/lib/auth";
import { redeemPartnerInviteCode } from "@/lib/partner-invites";

const sql = neon(process.env.DATABASE_URL!);

export async function POST(req: NextRequest) {
  // 3 registros por IP cada hora
  const { allowed, retryAfterSec } = rateLimit(
    `register:${getClientIP(req)}`,
    3,
    60 * 60 * 1000,
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Demasiados intentos de registro. Intenta más tarde." },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSec) },
      },
    );
  }

  let createdFirebaseUid: string | null = null;

  try {
    const { email, password, display_name, business_name, partner_code } = await req.json();

    // ── Validaciones básicas ──────────────────────────────────────
    if (!email || !password || !display_name || !business_name) {
      return NextResponse.json(
        { error: "Todos los campos son requeridos" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 6 caracteres" },
        { status: 400 }
      );
    }

    // ── 1. Usuario previo en PostgreSQL con este email ─────────────
    // Si existe y su firebase_uid sigue vivo en Firebase → 409.
    // Si existe pero su firebase_uid ya no existe en Firebase (registro
    // huérfano de un intento fallido), se re-vincula al nuevo uid en el
    // paso 3 en lugar de borrar datos.
    const [existingUser] = await sql`
      SELECT id, firebase_uid FROM users WHERE email = ${email} LIMIT 1
    `;

    if (existingUser?.firebase_uid) {
      try {
        await adminAuth.getUser(existingUser.firebase_uid);
        return NextResponse.json(
          { error: "Este correo ya está registrado" },
          { status: 409 }
        );
      } catch (fbError: any) {
        if (fbError.code !== "auth/user-not-found") throw fbError;
      }
    }

    // ── 2. Crear usuario en Firebase ──────────────────────────────
    try {
      const firebaseUser = await adminAuth.createUser({
        email,
        password,
        displayName: display_name,
      });
      createdFirebaseUid = firebaseUser.uid;
    } catch (firebaseError: any) {
      if (firebaseError.code === "auth/email-already-exists") {
        return NextResponse.json(
          { error: "Este correo ya está registrado" },
          { status: 409 }
        );
      }
      throw firebaseError;
    }

    // ── 3. Crear o re-vincular el usuario en PostgreSQL ───────────
    let userId: number;

    if (existingUser) {
      await sql`
        UPDATE users
        SET firebase_uid = ${createdFirebaseUid},
            display_name = ${display_name},
            is_active    = TRUE,
            updated_at   = NOW()
        WHERE id = ${existingUser.id}
      `;
      userId = existingUser.id;

      await sql`
        INSERT INTO user_profile (user_id, business_name)
        VALUES (${userId}, ${business_name})
        ON CONFLICT (user_id) DO UPDATE SET business_name = EXCLUDED.business_name
      `;
    } else {
      const [newUser] = await sql`
        INSERT INTO users (firebase_uid, email, display_name)
        VALUES (${createdFirebaseUid}, ${email}, ${display_name})
        RETURNING id
      `;
      userId = newUser.id;

      await sql`
        INSERT INTO user_profile (user_id, business_name)
        VALUES (${userId}, ${business_name})
      `;
    }

    // ── 4. Org + rol dueño + membresía + suscripción trial ────────
    const { orgId } = await ensureOrgExists(userId, business_name);

    // ── 5. Categorías por defecto (las cuentas se crean en onboarding)
    await seedDefaultCategories(orgId, userId, sql);

    // ── 6. Código de invitación de partner (opcional, ?ref= en /register)
    // Best-effort: un código inválido/vencido NUNCA debe tumbar el registro,
    // solo se ignora — el negocio ya se creó igual.
    if (partner_code) {
      try {
        await redeemPartnerInviteCode(sql, partner_code, orgId);
      } catch (partnerError) {
        console.error("No se pudo canjear el código de partner en registro:", partnerError);
      }
    }

    return NextResponse.json(
      {
        message: "Cuenta creada exitosamente",
        data: {
          user: { id: userId, email, display_name },
          org: { id: orgId },
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error en registro:", error);

    // Rollback Firebase si se creó (los datos de PG quedan como huérfanos
    // y se re-vinculan en el próximo intento — paso 1)
    if (createdFirebaseUid) {
      try {
        await adminAuth.deleteUser(createdFirebaseUid);
      } catch (rollbackError) {
        console.error("Error en rollback Firebase:", rollbackError);
      }
    }

    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Este correo ya está registrado" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Error al crear la cuenta. Por favor intenta de nuevo." },
      { status: 500 }
    );
  }
}
