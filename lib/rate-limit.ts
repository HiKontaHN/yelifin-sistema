// lib/rate-limit.ts
// Rate limiter con almacén compartido opcional (Upstash Redis vía REST).
// Si UPSTASH_REDIS_REST_URL/_TOKEN (o KV_REST_API_URL/_TOKEN, que crea la
// integracion de Upstash en Vercel) existen, el contador
// se comparte entre instancias. Si no existen (desarrollo) o Redis falla,
// se usa un Map en memoria por instancia.

type Entry = { count: number; resetAt: number };
type Result = { allowed: boolean; remaining: number; retryAfterSec: number };

const store = new Map<string, Entry>();

function cleanup() {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}

function memoryLimit(key: string, limit: number, windowMs: number): Result {
  cleanup();
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSec: 0 };
  }

  entry.count += 1;
  const remaining = Math.max(0, limit - entry.count);
  const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);

  return { allowed: entry.count <= limit, remaining, retryAfterSec };
}

async function redisLimit(
  url: string,
  token: string,
  key: string,
  limit: number,
  windowMs: number,
): Promise<Result> {
  // INCR + PEXPIRE NX (solo fija el TTL en la primera petición de la ventana) + PTTL.
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([
      ["INCR", key],
      ["PEXPIRE", key, windowMs, "NX"],
      ["PTTL", key],
    ]),
    signal: AbortSignal.timeout(1500),
  });
  if (!res.ok) throw new Error(`Redis ${res.status}`);
  const [incr, , pttl] = (await res.json()) as { result: number }[];
  const count = incr.result;
  const ttlMs = pttl.result > 0 ? pttl.result : windowMs;
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSec: count === 1 ? 0 : Math.ceil(ttlMs / 1000),
  };
}

/**
 * Verifica si una key (ej. "login:1.2.3.4") está dentro del límite.
 * @param key     Identificador único (acción + IP)
 * @param limit   Máximo de intentos permitidos en la ventana
 * @param windowMs Duración de la ventana en milisegundos
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<Result> {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (url && token) {
    try {
      return await redisLimit(url.replace(/\/$/, ""), token, key, limit, windowMs);
    } catch (error) {
      // shortcut: si Redis cae degradamos a memoria por instancia, no bloqueamos a todos.
      console.error("rateLimit: Redis no disponible, usando memoria:", error);
    }
  }
  return memoryLimit(key, limit, windowMs);
}

/**
 * IP del cliente según la plataforma: x-real-ip (la fija Vercel) o, si no
 * existe, el ÚLTIMO salto de x-forwarded-for. El primer valor lo puede
 * inventar el cliente, por eso no se usa.
 */
export function getClientIP(request: Request): string {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const hops = request.headers.get("x-forwarded-for")?.split(",");
  return hops?.[hops.length - 1]?.trim() || "unknown";
}
