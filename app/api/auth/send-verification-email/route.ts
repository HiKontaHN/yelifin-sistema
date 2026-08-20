// app/api/auth/send-verification-email/route.ts
// Reemplaza el sendEmailVerification() del cliente (que hacía que Firebase
// mandara el correo con su propia plantilla). El código de verificación lo
// sigue generando Firebase (adminAuth.generateEmailVerificationLink) — lo
// único que cambia es que ahora nosotros componemos y mandamos el correo
// con lib/mailer.ts + lib/email-templates.ts.
//
// El link cae en la página de acción por DEFECTO de Firebase
// (<project>.firebaseapp.com/__/auth/action), no en nuestra propia
// app/(auth)/auth/action/page.tsx — porque el Console de Firebase está
// rechazando el cambio de "Action URL" con EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED
// (bug/restricción reportada por otros en junio 2026, no es algo de este
// proyecto). Decisión: dejarlo así por ahora. Si en el futuro Firebase
// arregla eso y se configura el Action URL personalizado en Console →
// Authentication → Templates, el link empieza a caer en /auth/action
// automáticamente, sin tocar este archivo.
import { NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { verifyAuth, createErrorResponse, isAuthSuccess } from "@/lib/auth";
import { sendMail } from "@/lib/mailer";
import { verifyEmailTemplate } from "@/lib/email-templates";
import { rateLimit, getClientIP } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);

  // 5 reenvíos por IP cada 10 minutos — el botón "Reenviar" en
  // /verify-email ya tiene su propio cooldown de 60s en el cliente, esto
  // es solo el límite duro contra abuso.
  const { allowed, retryAfterSec } = rateLimit(
    `send-verification-email:${getClientIP(request)}`,
    5,
    10 * 60 * 1000,
  );
  if (!allowed) {
    return createErrorResponse(
      `Demasiados intentos. Intenta de nuevo en ${retryAfterSec}s.`,
      429,
    );
  }

  try {
    const { email } = auth.data;
    if (!email) return createErrorResponse("La cuenta no tiene correo asociado", 400);

    const actionLink = await adminAuth.generateEmailVerificationLink(email);
    const { subject, html, text } = verifyEmailTemplate({ actionLink });
    await sendMail({ to: email, subject, html, text });

    return Response.json({ data: { sent: true } });
  } catch (error) {
    console.error("POST /api/auth/send-verification-email:", error);
    return createErrorResponse("No se pudo enviar el correo de verificación", 500);
  }
}
