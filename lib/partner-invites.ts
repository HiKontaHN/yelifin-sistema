// lib/partner-invites.ts
//
// Canje de códigos de invitación de partner (ver
// database/partners/04-invite-codes.sql). El código se GENERA del lado de
// hikonta-partners — este repo solo lo canjea, desde dos puntos de entrada:
//   1. app/api/auth/register  (nuevo usuario, ?ref=CODIGO en la URL)
//   2. app/api/organization/link-partner (usuario/org ya existente)
// Misma función para los dos casos para que la validación no diverja.

import type { NeonQueryFunction } from "@neondatabase/serverless";

type Sql = NeonQueryFunction<false, false>;

export type InviteLookup =
  | { valid: true; partnerId: number; partnerName: string }
  | { valid: false; reason: "NOT_FOUND" | "EXPIRED" | "REVOKED" | "USED" };

// Info pública mínima de un código — usada por el banner de /register y
// para validar antes de intentar el canje. No expone nada del partner
// aparte del nombre (ni email, ni conteo de orgs, etc.).
export async function lookupInviteCode(sql: Sql, rawCode: string): Promise<InviteLookup> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { valid: false, reason: "NOT_FOUND" };

  const [row] = await sql`
    SELECT ic.expires_at, ic.revoked_at, ic.used_at, p.id AS partner_id, p.name AS partner_name
    FROM partner_invite_codes ic
    JOIN partners p ON p.id = ic.partner_id AND p.is_active = TRUE
    WHERE ic.code = ${code}
  `;

  if (!row) return { valid: false, reason: "NOT_FOUND" };
  if (row.revoked_at) return { valid: false, reason: "REVOKED" };
  if (row.used_at) return { valid: false, reason: "USED" };
  if (new Date(row.expires_at).getTime() < Date.now()) return { valid: false, reason: "EXPIRED" };

  return { valid: true, partnerId: row.partner_id, partnerName: row.partner_name };
}

export type RedeemResult =
  | { ok: true; partnerName: string }
  | { ok: false; reason: "NOT_FOUND" | "EXPIRED" | "REVOKED" | "USED" | "ALREADY_LINKED" };

// Canjea el código para `orgId`: crea el vínculo en partner_organizations
// (share_financials queda en FALSE por defecto, como cualquier vínculo —
// ver 02-partners-infrastructure.sql) y marca el código usado.
//
// El driver HTTP de Neon no soporta transacciones reales (cada query es su
// propia conexión — mismo comentario que ya deja app/api/onboarding), así
// que el UPDATE de `used_at` va condicionado con `WHERE used_at IS NULL`
// para que dos canjes simultáneos del mismo código no lo usen dos veces
// (el segundo simplemente no actualiza ninguna fila).
export async function redeemPartnerInviteCode(sql: Sql, rawCode: string, orgId: number): Promise<RedeemResult> {
  const lookup = await lookupInviteCode(sql, rawCode);
  if (!lookup.valid) return { ok: false, reason: lookup.reason };

  const [alreadyLinked] = await sql`
    SELECT 1 FROM partner_organizations WHERE partner_id = ${lookup.partnerId} AND org_id = ${orgId}
  `;
  if (alreadyLinked) return { ok: false, reason: "ALREADY_LINKED" };

  const code = rawCode.trim().toUpperCase();
  const [claimed] = await sql`
    UPDATE partner_invite_codes
    SET used_at = NOW(), used_by_org_id = ${orgId}
    WHERE code = ${code} AND used_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()
    RETURNING id
  `;
  if (!claimed) return { ok: false, reason: "USED" };

  await sql`
    INSERT INTO partner_organizations (partner_id, org_id)
    VALUES (${lookup.partnerId}, ${orgId})
    ON CONFLICT (partner_id, org_id) DO NOTHING
  `;

  return { ok: true, partnerName: lookup.partnerName };
}
