// lib/bch-exchange-rate.ts
//
// Sincroniza el tipo de cambio USD → HNL desde la Web-API del Banco
// Central de Honduras (indicador 620 — "Tipo de Cambio Nominal - Venta",
// lo que le importa a alguien pagando en Lempiras algo cotizado en USD) y
// lo guarda en exchange_rates (v4.22).
//
// Dos llamadores:
// - app/api/cron/exchange-rate: corre 1x/día vía Vercel Cron.
// - app/api/exchange-rate: fallback en vivo cuando la fila más reciente
//   guardada no es de hoy (el cron diario todavía no corrió, o falló).
//
// Requiere BCH_API_KEY (suscripción "hikonta.app" al producto "Web-API del
// Banco Central de Honduras").
const BCH_INDICATOR_ID = 620;
const BCH_API_BASE = "https://bchapi-am.azure-api.net/api";

type Cifra = { Fecha: string; Valor: number };

export type ExchangeRateResult = { rate_date: string; usd_hnl: number };

export async function syncExchangeRateFromBCH(sql: any): Promise<ExchangeRateResult> {
  if (!process.env.BCH_API_KEY) {
    throw new Error("Falta configurar BCH_API_KEY");
  }

  const res = await fetch(
    `${BCH_API_BASE}/v1/indicadores/${BCH_INDICATOR_ID}/cifras?reciente=5&ordenamiento=desc`,
    { headers: { clave: process.env.BCH_API_KEY } }
  );
  if (!res.ok) throw new Error(`BCH respondió ${res.status}`);

  const cifras = (await res.json()) as Cifra[];

  // Ya vienen ordenadas por fecha descendente — se toma la primera con
  // valor válido (el BCH a veces publica una fila en 0 para el día en
  // curso antes de cerrarlo).
  const found = cifras.find((c) => Number.isFinite(c.Valor) && c.Valor > 0);
  if (!found) throw new Error("No se encontró ninguna cifra de tipo de cambio válida");

  const rateDate = found.Fecha.slice(0, 10); // "2026-09-29T00:00:00" → "2026-09-29"
  const rate = Number(found.Valor);

  await sql`
    INSERT INTO exchange_rates (rate_date, usd_hnl, source)
    VALUES (${rateDate}, ${rate}, 'BCH')
    ON CONFLICT (rate_date) DO UPDATE SET usd_hnl = EXCLUDED.usd_hnl, fetched_at = NOW()
  `;

  return { rate_date: rateDate, usd_hnl: rate };
}
