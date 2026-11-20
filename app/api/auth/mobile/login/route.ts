import { getClientIP, sharedRateLimit } from "@/lib/rate-limit";

function reply(body: { token: string } | { error: string }, status: number, retryAfter?: number) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (retryAfter !== undefined) headers.set("Retry-After", String(retryAfter));
  return Response.json(body, { status, headers });
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
  if (!email || email.length > 254 || !password || password.length > 4096) {
    return reply({ error: "Ingresa un correo y una contraseña válidos." }, 400);
  }

  const unavailable = { error: "El servicio de acceso no está disponible." };
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
  if (!apiKey) return reply(unavailable, 503);

  try {
    const upstream = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    );
    const result = await upstream.json().catch(() => null);
    if (upstream.status === 429 || result?.error?.message === "TOO_MANY_ATTEMPTS_TRY_LATER") {
      return reply(rateLimitError, 429);
    }
    if (upstream.status >= 500 || !result) return reply(unavailable, 503);
    if (!upstream.ok) {
      return reply({ error: "No se pudo iniciar sesión. Revisa tu correo y contraseña." }, 401);
    }
    if (typeof result.idToken !== "string" || !result.idToken) return reply(unavailable, 503);
    return reply({ token: result.idToken }, 200);
  } catch {
    return reply(unavailable, 503);
  }
}
