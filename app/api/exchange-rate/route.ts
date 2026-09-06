// app/api/exchange-rate/route.ts
// Tipo de cambio USD → HNL sugerido — el cron de
// app/api/cron/exchange-rate lo actualiza a diario desde el BCH. Solo
// devuelve el más reciente guardado; cualquier usuario autenticado puede
// consultarlo (no hay dato sensible ni de organización aquí).
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);

  try {
    const [row] = await sql`
      SELECT rate_date, usd_hnl FROM exchange_rates ORDER BY rate_date DESC LIMIT 1
    `;

    return Response.json({
      data: row ? { rate_date: row.rate_date, usd_hnl: Number(row.usd_hnl) } : null,
    });
  } catch (error) {
    console.error("GET /api/exchange-rate:", error);
    return createErrorResponse("Error al obtener el tipo de cambio", 500);
  }
}
