// app/api/cron/exchange-rate/route.ts
//
// Cron diario (ver vercel.json) que sincroniza el tipo de cambio USD → HNL
// desde la Web-API del BCH (lib/bch-exchange-rate.ts) en exchange_rates
// (v4.22) — el frontend lo usa como tasa de cambio SUGERIDA (siempre
// editable) en los formularios de compra. app/api/exchange-rate hace el
// mismo llamado como fallback en vivo si este cron todavía no corrió hoy.
//
// Requiere BCH_API_KEY (suscripción "hikonta.app" al producto "Web-API del
// Banco Central de Honduras" — ver portal de desarrolladores del BCH).
//
// Apagado de emergencia: poner EXCHANGE_RATE_SYNC_ENABLED=false en las
// variables de entorno del proyecto en Vercel y redeploy — mismo patrón
// que INVENTORY_SNAPSHOT_ENABLED en el otro cron.
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { syncExchangeRateFromBCH } from "@/lib/bch-exchange-rate";

const sql = neon(process.env.DATABASE_URL!);

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  if (process.env.EXCHANGE_RATE_SYNC_ENABLED === "false") {
    return Response.json({ ok: true, skipped: true, reason: "EXCHANGE_RATE_SYNC_ENABLED=false" });
  }

  try {
    const { rate_date, usd_hnl } = await syncExchangeRateFromBCH(sql);
    return Response.json({ ok: true, rate_date, usd_hnl });
  } catch (error) {
    console.error("GET /api/cron/exchange-rate:", error);
    return Response.json({ error: "Error al sincronizar el tipo de cambio" }, { status: 500 });
  }
}
