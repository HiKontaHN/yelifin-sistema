import { NextResponse, type NextRequest } from "next/server";
import { meetsPasswordPolicy } from "@/lib/password-policy";
import { getClientIP, sharedRateLimit } from "@/lib/rate-limit";
import { hasValidRequestOrigin } from "@/lib/request-origin";
import { clearSessionCookies } from "@/lib/session-cookies";

const INVALID_LINK = "Este enlace no es válido, expiró o ya fue utilizado. Solicita uno nuevo.";
const UNAVAILABLE = "No se pudo procesar la solicitud. Intenta de nuevo en unos minutos.";

function reply(body: object, status: number, retryAfterSec?: number) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (retryAfterSec !== undefined) headers.set("Retry-After", String(retryAfterSec));
  return NextResponse.json(body, { status, headers });
}

export async function POST(request: NextRequest) {
  if (!hasValidRequestOrigin(request)) return reply({ error: "Origen no autorizado" }, 403);

  const { allowed, retryAfterSec } = await sharedRateLimit(
    `reset-password:${getClientIP(request)}`,
    20,
    10 * 60 * 1000,
  );
  if (!allowed) {
    return reply({ error: "Demasiados intentos. Intenta de nuevo en unos minutos." }, 429, retryAfterSec);
  }

  const body = await request.json().catch(() => null);
  const oobCode = body?.oobCode;
  const newPassword = body?.newPassword;
  if (typeof oobCode !== "string" || !oobCode || oobCode.length > 4096) {
    return reply({ code: "invalid-link", error: INVALID_LINK }, 400);
  }
  if (newPassword !== undefined &&
    (typeof newPassword !== "string" || newPassword.length > 4096 || !meetsPasswordPolicy(newPassword))
  ) {
    return reply({ error: "La contraseña no cumple los requisitos." }, 400);
  }

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
  if (!apiKey) return reply({ error: UNAVAILABLE }, 503);

  try {
    // Firebase comprueba el código si solo se envía oobCode. Con newPassword
    // actualiza la contraseña y consume el código en la misma operación.
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oobCode, newPassword }),
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (response.ok && newPassword !== undefined) return clearSessionCookies(reply({ ok: true }, 200));

    const result = await response.json().catch(() => null);
    if (response.ok && result?.requestType === "PASSWORD_RESET" && typeof result.email === "string") {
      return reply({ email: result.email }, 200);
    }
    const error = typeof result?.error?.message === "string" ? result.error.message : "";
    if (response.status === 429 || error === "TOO_MANY_ATTEMPTS_TRY_LATER") {
      return reply({ error: "Demasiados intentos. Intenta de nuevo en unos minutos." }, 429);
    }
    if (error.startsWith("WEAK_PASSWORD") || error.startsWith("PASSWORD_DOES_NOT_MEET_REQUIREMENTS")) {
      return reply({ error: "La contraseña no cumple los requisitos de seguridad." }, 400);
    }
    if (
      (response.ok && result) ||
      ["EXPIRED_OOB_CODE", "INVALID_OOB_CODE", "USER_DISABLED", "USER_NOT_FOUND", "EMAIL_NOT_FOUND"].includes(error)
    ) {
      return reply({ code: "invalid-link", error: INVALID_LINK }, 400);
    }
    return reply({ error: UNAVAILABLE }, 503);
  } catch {
    return reply({ error: UNAVAILABLE }, 503);
  }
}
