import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 365;

function getSecret(): string {
  const secret = process.env.MARKETING_UNSUBSCRIBE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("MARKETING_UNSUBSCRIBE_SECRET debe tener al menos 32 caracteres");
  }
  return secret;
}

function signature(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function createUnsubscribeToken(email: string): string {
  const payload = Buffer.from(
    JSON.stringify({ email: email.trim().toLowerCase(), exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS }),
  ).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
  const [payload, suppliedSignature] = token.split(".");
  if (!payload || !suppliedSignature) return null;

  const expectedSignature = signature(payload);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof decoded.email !== "string" || typeof decoded.exp !== "number") return null;
    if (decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return decoded.email.trim().toLowerCase();
  } catch {
    return null;
  }
}

export function buildUnsubscribeUrl(email: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://hikonta.app";
  const token = createUnsubscribeToken(email);
  return `${appUrl.replace(/\/$/, "")}/unsubscribe?token=${encodeURIComponent(token)}`;
}
