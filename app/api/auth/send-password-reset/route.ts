import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { adminAuth } from "@/lib/firebase-admin";
import { createErrorResponse } from "@/lib/auth";
import { sendMail } from "@/lib/mailer";
import { resetPasswordTemplate } from "@/lib/email-templates";
import { sharedRateLimit, getClientIP } from "@/lib/rate-limit";

const sql = neon(process.env.DATABASE_URL!);
const ACCOUNT_NOT_FOUND = "No hay una cuenta de HiKonta registrada con ese correo.";
const SEND_FAILED = "No se pudo enviar el correo de recuperación. Intenta de nuevo más tarde.";

export async function POST(request: NextRequest) {
  // 5 solicitudes por IP cada 10 minutos.
  const { allowed, retryAfterSec } = await sharedRateLimit(
    `send-password-reset:${getClientIP(request)}`,
    5,
    10 * 60 * 1000,
  );
  if (!allowed) {
    return createErrorResponse(
      `Demasiados intentos. Intenta de nuevo en ${retryAfterSec}s.`,
      429,
    );
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return createErrorResponse("Ingresa un correo válido.", 400);
  }

  // Aplica antes de consultar la cuenta, aunque cambie la IP.
  const emailKey = createHash("sha256").update(email).digest("hex");
  const byEmail = await sharedRateLimit(
    `send-password-reset-email:${emailKey}`,
    3,
    60 * 60 * 1000,
  );
  if (!byEmail.allowed) {
    return createErrorResponse(
      `Demasiados intentos para este correo. Intenta de nuevo en ${Math.ceil(byEmail.retryAfterSec / 60)} min.`,
      429,
    );
  }

  let stage: "firebase" | "account" | "link" | "smtp" = "firebase";
  try {
    const identity = await adminAuth.getUserByEmail(email);
    stage = "account";
    const [account] = await sql`
      SELECT u.is_active
      FROM users u
      WHERE u.firebase_uid = ${identity.uid}
        AND NOT EXISTS (SELECT 1 FROM partners p WHERE p.user_id = u.id)
    `;
    if (!account) return createErrorResponse(ACCOUNT_NOT_FOUND, 404);
    if (!account.is_active || identity.disabled) {
      return createErrorResponse("Esta cuenta de HiKonta está deshabilitada.", 403);
    }

    stage = "firebase";
    const generatedLink = await adminAuth.generatePasswordResetLink(email);
    stage = "link";
    const firebaseLink = new URL(generatedLink);
    const oobCode = firebaseLink.searchParams.get("oobCode");
    if (firebaseLink.searchParams.get("mode") !== "resetPassword" || !oobCode) {
      throw new Error("Firebase devolvió un enlace de recuperación inválido");
    }

    const actionLink = new URL("/auth/action", process.env.NEXT_PUBLIC_APP_URL ?? "https://hikonta.app");
    actionLink.searchParams.set("mode", "resetPassword");
    // El fragmento no se envía en la URL de la solicitud HTTP.
    actionLink.hash = new URLSearchParams({ oobCode }).toString();
    const { subject, html, text } = resetPasswordTemplate({ actionLink: actionLink.href });
    stage = "smtp";
    await sendMail({ to: email, subject, html, text, deliverToAccount: true });
    return Response.json({ data: { message: "Te enviamos un correo con el enlace de recuperación." } });
  } catch (error) {
    const failure = error && typeof error === "object" ? error as { code?: unknown; responseCode?: unknown } : {};
    if (stage === "firebase" && failure.code === "auth/user-not-found") {
      return createErrorResponse(ACCOUNT_NOT_FOUND, 404);
    }
    const code = typeof failure.code === "string" && /^(?:auth\/[a-z-]{1,40}|E[A-Z]{2,23})$/.test(failure.code)
      ? failure.code
      : undefined;
    const smtpStatus = stage === "smtp" && typeof failure.responseCode === "number"
      ? failure.responseCode
      : undefined;
    console.error("POST /api/auth/send-password-reset: falló el envío", { stage, code, smtpStatus });
    return createErrorResponse(SEND_FAILED, 503);
  }
}
