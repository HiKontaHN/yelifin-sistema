-- ============================================================
-- MIGRACIÓN v4.22: TIPO DE CAMBIO DIARIO (BCH)
-- Fecha: 2026-09-05
-- ============================================================
-- Guarda el tipo de cambio USD → HNL que publica a diario el Banco
-- Central de Honduras (archivo .xlsx público, columna "Venta" — el
-- precio al que el banco vende dólares, que es el que le importa a
-- alguien pagando en Lempiras algo cotizado en USD). Lo llena el cron
-- de app/api/cron/exchange-rate/route.ts y lo consume el frontend como
-- valor SUGERIDO (siempre editable) en los formularios de compra que
-- piden tasa de cambio — no reemplaza la posibilidad de ingresarlo a mano.
-- ============================================================

CREATE TABLE IF NOT EXISTS exchange_rates (
  id         BIGSERIAL PRIMARY KEY,
  rate_date  DATE NOT NULL UNIQUE,
  usd_hnl    NUMERIC(10,4) NOT NULL CHECK (usd_hnl > 0),
  source     VARCHAR(20) NOT NULL DEFAULT 'BCH',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_date ON exchange_rates(rate_date DESC);
