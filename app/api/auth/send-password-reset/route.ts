// app/api/auth/send-password-reset/route.ts
// Reemplaza el sendPasswordResetEmail() del cliente. Público a propósito
// (nadie tiene sesión cuando olvida su contraseña) — por eso el límite de
// intentos es más estricto que el resto, y la respuesta es SIEMPRE la
// misma exista o no la cuenta, para no revelar qué correos están
// registrados (mismo comportamiento que ya tenía components/auth/login-form.tsx).
//
// El link cae en la página de acción POR DEFECTO de Firebase, no en
// app/(auth)/auth/action/page.tsx — ver la nota en
// send-verification-email/route.ts sobre por qué (Console de Firebase
// rechazando el Action URL personalizado con EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED).
import { NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { createErrorResponse } from "@/lib/auth";
import { sendMail } from "@/lib/mailer";
import { resetPasswordTemplate } from "@/lib/email-templates";
import { rateLimit, getClientIP } from "@/lib/rate-limit";

const GENERIC_RESPONSE = {
  data: { message: "Si el correo está registrado, recibirás un enlace en breve." },
};

export async function POST(request: NextRequest) {
  // 5 solicitudes por IP cada 10 minutos.
  const { allowed, retryAfterSec } = rateLimit(
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

  try {
    const body = await request.json().catch(() => ({}));
    const email = (body?.email ?? "").toString().trim().toLowerCase();
    if (!email) return createErrorResponse("Correo inválido", 400);

    try {
      const actionLink = await adminAuth.generatePasswordResetLink(email);
      const { subject, html, text } = resetPasswordTemplate({ actionLink });
      await sendMail({ to: email, subject, html, text });
    } catch (error: any) {
      // auth/user-not-found (o cualquier otro fallo de Firebase para este
      // correo) → no revelar nada, solo no mandar el correo.
      if (error?.code !== "auth/user-not-found") {
        console.error("POST /api/auth/send-password-reset (generar/enviar):", error);
      }
    }

    return Response.json(GENERIC_RESPONSE);
  } catch (error) {
    console.error("POST /api/auth/send-password-reset:", error);
    // Aun ante un error inesperado, misma respuesta genérica.
    return Response.json(GENERIC_RESPONSE);
  }
}
