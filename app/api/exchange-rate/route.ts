// app/api/exchange-rate/route.ts
// Tipo de cambio USD → HNL sugerido — el cron de app/api/cron/exchange-rate
// lo actualiza a diario desde el BCH. Cualquier usuario autenticado puede
// consultarlo (no hay dato sensible ni de organización aquí).
//
// Si la fila más reciente no es de HOY (el cron diario todavía no corrió, o
// falló), se intenta traer el dato en vivo del BCH antes de responder —
// misma lógica que usa el cron (lib/bch-exchange-rate.ts). Si ese intento
// también falla, se cae a lo último guardado (o null) en vez de romper el
// formulario: esto es siempre una SUGERENCIA editable, nunca un valor
// obligatorio para completar una compra.
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess } from "@/lib/auth";
import { syncExchangeRateFromBCH } from "@/lib/bch-exchange-rate";

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);

  try {
    // CURRENT_DATE respeta el timezone de la sesión (America/Tegucigalpa,
    // fijado en DATABASE_URL), así que "hoy" aquí es hoy en Honduras, no en UTC.
    const [row] = await sql`
      SELECT rate_date, usd_hnl, (rate_date = CURRENT_DATE) AS is_today
      FROM exchange_rates
      ORDER BY rate_date DESC
      LIMIT 1
    `;

    if (row?.is_today) {
      return Response.json({
        data: { rate_date: row.rate_date, usd_hnl: Number(row.usd_hnl) },
      });
    }

    try {
      const fresh = await syncExchangeRateFromBCH(sql);
      return Response.json({ data: fresh });
    } catch (bchError) {
      console.error("GET /api/exchange-rate: fallback en vivo al BCH falló:", bchError);
      return Response.json({
        data: row ? { rate_date: row.rate_date, usd_hnl: Number(row.usd_hnl) } : null,
      });
    }
  } catch (error) {
    console.error("GET /api/exchange-rate:", error);
    return createErrorResponse("Error al obtener el tipo de cambio", 500);
  }
}
