// app/api/partners/invite-info/route.ts
//
// GET público (sin auth) — usado por /register?ref=CODIGO para mostrarle al
// visitante "te estás uniendo a través de {partner}" antes de crear la
// cuenta. Solo expone el nombre del partner, nada más.
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { lookupInviteCode } from "@/lib/partner-invites";
import { rateLimit, getClientIP } from "@/lib/rate-limit";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return Response.json({ data: { valid: false } });

  // Sin auth (lo llama /register antes de crear cuenta) — limitar intentos
  // por IP para que no sirva para adivinar códigos por fuerza bruta.
  const { allowed } = rateLimit(`invite-info:${getClientIP(request)}`, 20, 10 * 60 * 1000);
  if (!allowed) return Response.json({ data: { valid: false } });

  try {
    const result = await lookupInviteCode(sql, code);
    if (!result.valid) return Response.json({ data: { valid: false } });
    return Response.json({ data: { valid: true, partnerName: result.partnerName } });
  } catch (error) {
    console.error("GET /api/partners/invite-info:", error);
    return Response.json({ data: { valid: false } });
  }
}
