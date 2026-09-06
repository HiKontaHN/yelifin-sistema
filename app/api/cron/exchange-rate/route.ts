// app/api/cron/exchange-rate/route.ts
//
// Cron diario (ver vercel.json) que descarga el archivo público del Banco
// Central de Honduras con el precio diario del dólar y guarda la columna
// "Venta" (lo que le importa a alguien pagando en Lempiras algo cotizado
// en USD) en exchange_rates (v4.22) — el frontend lo usa como tasa de
// cambio SUGERIDA (siempre editable) en los formularios de compra.
//
// Apagado de emergencia: poner EXCHANGE_RATE_SYNC_ENABLED=false en las
// variables de entorno del proyecto en Vercel y redeploy — mismo patrón
// que INVENTORY_SNAPSHOT_ENABLED en el otro cron.
import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import * as XLSX from "xlsx";

const sql = neon(process.env.DATABASE_URL!);

export const maxDuration = 30;

const BCH_URL =
  "https://www.bch.hn/estadisticos/GIE/LIBTipo%20de%20cambio/Precio%20Promedio%20Diario%20del%20D%C3%B3lar.xlsx";

// Filas de datos: "9/4/26" (M/D/YY) — las filas de resumen mensual
// ("Enero 2/") y las notas al pie no calzan con este patrón.
const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  if (process.env.EXCHANGE_RATE_SYNC_ENABLED === "false") {
    return Response.json({ ok: true, skipped: true, reason: "EXCHANGE_RATE_SYNC_ENABLED=false" });
  }

  try {
    const res = await fetch(BCH_URL);
    if (!res.ok) throw new Error(`BCH respondió ${res.status}`);

    const buf = await res.arrayBuffer();
    const workbook = XLSX.read(buf, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, raw: false });

    // La fila más reciente con datos válidos está al final del historial
    // (2000-hoy) — se recorre de atrás hacia adelante hasta encontrar la
    // primera que calce con el patrón de fecha diaria.
    let found: { date: string; rate: number } | null = null;
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      const rawDate = typeof row?.[0] === "string" ? row[0].trim() : "";
      const match = rawDate.match(DATE_RE);
      if (!match) continue;

      const venta = parseFloat(String(row[2] ?? "").trim());
      if (!Number.isFinite(venta) || venta <= 0) continue;

      const [, month, day, yy] = match;
      const isoDate = `20${yy}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      found = { date: isoDate, rate: venta };
      break;
    }

    if (!found) throw new Error("No se encontró ninguna fila de tipo de cambio válida en el archivo");

    await sql`
      INSERT INTO exchange_rates (rate_date, usd_hnl, source)
      VALUES (${found.date}, ${found.rate}, 'BCH')
      ON CONFLICT (rate_date) DO UPDATE SET usd_hnl = EXCLUDED.usd_hnl, fetched_at = NOW()
    `;

    return Response.json({ ok: true, rate_date: found.date, usd_hnl: found.rate });
  } catch (error) {
    console.error("GET /api/cron/exchange-rate:", error);
    return Response.json({ error: "Error al sincronizar el tipo de cambio" }, { status: 500 });
  }
}
