import { getClientIP, sharedRateLimit } from "@/lib/rate-limit";

function reply(body: { token: string } | { linkEmail: string } | { error: string }, status: number, retryAfter?: number) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (retryAfter !== undefined) headers.set("Retry-After", String(retryAfter));
  return Response.json(body, { status, headers });
}

async function signInWithFirebase(apiKey: string, operation: "signInWithPassword" | "signInWithIdp", payload: object) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:${operation}?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, returnSecureToken: true }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    },
  );
  return { response, result: await response.json().catch(() => null) };
}

export async function POST(request: Request) {
  const { allowed, retryAfterSec } = await sharedRateLimit(
    `mobile-login:${getClientIP(request)}`,
    5,
    15 * 60 * 1000,
  );
  const rateLimitError = { error: "Demasiados intentos. Espera unos minutos e intenta de nuevo." };
  if (!allowed) return reply(rateLimitError, 429, retryAfterSec);

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const googleIdToken = typeof body?.googleIdToken === "string" ? body.googleIdToken : "";
  const hasPassword = Boolean(email || password);
  if ((!googleIdToken || hasPassword) && (!email || email.length > 254 || !password || password.length > 4096)) {
    return reply({ error: "Ingresa un correo y una contraseña válidos." }, 400);
  }
  if (googleIdToken.length > 8192) return reply({ error: "La credencial de Google no es válida." }, 400);

  const unavailable = { error: "El servicio de acceso no está disponible." };
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
  if (!apiKey) return reply(unavailable, 503);

  try {
    const googleCredential = {
      postBody: new URLSearchParams({ id_token: googleIdToken, providerId: "google.com" }).toString(),
      requestUri: `https://${process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "hikonta.app"}`,
      returnIdpCredential: true,
    };
    let { response: upstream, result } = googleIdToken
      ? await signInWithFirebase(apiKey, "signInWithIdp", googleCredential)
      : await signInWithFirebase(apiKey, "signInWithPassword", { email, password });

    if (googleIdToken && upstream.ok && result?.needConfirmation === true && typeof result.email === "string") {
      if (!hasPassword) return reply({ linkEmail: result.email }, 200);
      if (email.toLowerCase() !== result.email.toLowerCase()) {
        return reply({ error: "Ingresa la contraseña de la cuenta asociada a ese correo de Google." }, 400);
      }
      const existing = await signInWithFirebase(apiKey, "signInWithPassword", { email, password });
      if (existing.response.status === 429 || existing.result?.error?.message === "TOO_MANY_ATTEMPTS_TRY_LATER") {
        return reply(rateLimitError, 429);
      }
      if (existing.response.status >= 500) return reply(unavailable, 503);
      if (!existing.response.ok || typeof existing.result?.idToken !== "string") {
        return reply({ error: "No se pudo iniciar sesión. Revisa tu correo y contraseña." }, 401);
      }
      ({ response: upstream, result } = await signInWithFirebase(apiKey, "signInWithIdp", {
        ...googleCredential,
        idToken: existing.result.idToken,
      }));
    }
    if (upstream.status === 429 || result?.error?.message === "TOO_MANY_ATTEMPTS_TRY_LATER") {
      return reply(rateLimitError, 429);
    }
    if (upstream.status >= 500 || !result) return reply(unavailable, 503);
    if (!upstream.ok) {
      return reply({ error: googleIdToken
        ? "No se pudo iniciar sesión con Google. Intenta de nuevo."
        : "No se pudo iniciar sesión. Revisa tu correo y contraseña." }, 401);
    }
    if (typeof result.idToken !== "string" || !result.idToken) return reply(unavailable, 503);
    if (googleIdToken && result.emailVerified !== true) {
      return reply({ error: "Google no pudo confirmar el correo de esta cuenta." }, 403);
    }
    return reply({ token: result.idToken }, 200);
  } catch {
    return reply(unavailable, 503);
  }
}
