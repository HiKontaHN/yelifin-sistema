// app/api/organization/link-partner/route.ts
//
// Vincula la org del usuario autenticado al portafolio de un partner
// canjeando un código de invitación (ver lib/partner-invites.ts) — usado
// por Configuración > Organización cuando el negocio YA existe (la otra
// mitad del flujo es app/api/auth/register, para negocios nuevos).
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess } from "@/lib/auth";
import { redeemPartnerInviteCode } from "@/lib/partner-invites";
import { rateLimit, getClientIP } from "@/lib/rate-limit";

const sql = neon(process.env.DATABASE_URL!);

const REASON_MESSAGE: Record<string, string> = {
  NOT_FOUND: "Código inválido — verificá que esté bien escrito.",
  EXPIRED: "Este código ya venció — pedile uno nuevo a tu incubadora.",
  REVOKED: "Este código fue cancelado — pedile uno nuevo a tu incubadora.",
  USED: "Este código ya fue utilizado.",
  ALREADY_LINKED: "Tu negocio ya está vinculado a esta incubadora.",
};

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);

  if (!auth.data.isOwner) {
    return createErrorResponse("Solo el dueño puede vincular el negocio a una incubadora", 403);
  }

  // Intentos de código por usuario — evita fuerza bruta contra códigos de
  // otros partners (mismo criterio que login/reset-password).
  const { allowed, retryAfterSec } = rateLimit(`link-partner:${getClientIP(request)}`, 10, 15 * 60 * 1000);
  if (!allowed) {
    return Response.json(
      { error: "Demasiados intentos. Esperá unos minutos." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
  }

  try {
    const body = await request.json();
    const code = (body?.code ?? "").toString().trim();
    if (!code) return createErrorResponse("Ingresá un código", 400);

    const result = await redeemPartnerInviteCode(sql, code, auth.data.orgId);
    if (!result.ok) {
      return createErrorResponse(REASON_MESSAGE[result.reason] ?? "No se pudo vincular el código", 400);
    }

    return Response.json({ message: `Tu negocio quedó vinculado a ${result.partnerName}`, data: { partnerName: result.partnerName } });
  } catch (error) {
    console.error("POST /api/organization/link-partner:", error);
    return createErrorResponse("Error al vincular el código", 500);
  }
}
