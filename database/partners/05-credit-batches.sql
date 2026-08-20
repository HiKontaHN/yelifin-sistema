-- ============================================================
-- PARTNERS 05: LOTES DE CRÉDITOS DE SUSCRIPCIÓN (facturación anticipada)
-- Fecha: 2026-08-19
-- ============================================================
-- Resuelve la primera mitad de "Invitaciones de suscripción patrocinada"
-- (documentation/feature-sponsorship-invites.md en hikonta-admin): un
-- partner compra N suscripciones de M meses SIN saber todavía a qué
-- organización van — hoy `POST /api/admin/partners/[id]/sponsor` (ver
-- database/partners/02) exige org_ids ya existentes, no sirve para esto.
--
-- Diferencia clave con el patrocinio por lote que ya existe: ahí cada
-- organización queda con un `subscription_payments` INDEPENDIENTE en el
-- momento de patrocinarla (N pagos). Acá se genera UN solo cobro por todo
-- el lote (precio del plan × meses × cantidad, con descuento opcional) en
-- el momento de la compra — el partner paga una vez y le quedan N
-- "créditos" (plazas) pendientes de asignar. Asignar un crédito a una
-- organización (canje) es un paso FUTURO, todavía no construido — por eso
-- `partner_subscription_credits` ya tiene status/token/claimed_* aunque
-- ningún endpoint los use todavía, para no requerir otra migración cuando
-- se construya el canje.
--
-- Este script:
--   1. Crea `partner_credit_batches` — la "factura": qué plan, cuántos
--      meses, cuántas suscripciones, precio de lista vs. precio pactado
--      (el descuento es la diferencia entre ambos), total cobrado.
--   2. Crea `partner_subscription_credits` — un fila por cada suscripción
--      individual del lote (si quantity = 20, son 20 filas), todas
--      PENDING hasta que el canje (fuera de alcance de este script) las
--      pase a CLAIMED con una organización real.
--
-- PRERREQUISITO: database/partners/02-partners-infrastructure.sql ya
--                ejecutado (partners existe).
-- SEGURO DE EJECUTAR EN PRODUCCIÓN: tablas nuevas con IF NOT EXISTS, no
-- toca ninguna tabla existente.
-- ============================================================

-- ============================================================
-- PASO 1: partner_credit_batches
-- ============================================================

CREATE TABLE IF NOT EXISTS partner_credit_batches (
  id                 BIGSERIAL     PRIMARY KEY,
  partner_id         BIGINT        NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  plan_id            BIGINT        NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  months             INT           NOT NULL CHECK (months >= 1),
  quantity           INT           NOT NULL CHECK (quantity >= 1 AND quantity <= 500),
  -- Snapshot de subscription_plans.price_usd × months al momento de la
  -- compra — el precio de lista no se mueve aunque el plan cambie de
  -- precio después. unit_price_usd es el precio FINAL pactado por
  -- suscripción (ya con cualquier descuento aplicado); la diferencia
  -- (list_unit_price_usd - unit_price_usd) × quantity es el descuento.
  list_unit_price_usd NUMERIC(10,2) NOT NULL CHECK (list_unit_price_usd >= 0),
  unit_price_usd      NUMERIC(10,2) NOT NULL CHECK (unit_price_usd >= 0),
  total_usd           NUMERIC(10,2) NOT NULL CHECK (total_usd >= 0), -- unit_price_usd × quantity, lo que se cobró
  currency           VARCHAR(10)   NOT NULL DEFAULT 'USD',
  provider           VARCHAR(20)   NOT NULL DEFAULT 'MANUAL' CHECK (provider IN ('MANUAL', 'STRIPE', 'PAYPAL')),
  receipt_url        TEXT,
  notes              TEXT,
  created_by_user_id BIGINT        REFERENCES users(id),
  created_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_partner_credit_batches_partner ON partner_credit_batches(partner_id);

-- ============================================================
-- PASO 2: partner_subscription_credits
-- ============================================================

CREATE TABLE IF NOT EXISTS partner_subscription_credits (
  id             BIGSERIAL    PRIMARY KEY,
  batch_id       BIGINT       NOT NULL REFERENCES partner_credit_batches(id) ON DELETE CASCADE,
  partner_id     BIGINT       NOT NULL REFERENCES partners(id) ON DELETE CASCADE, -- denormalizado del batch, evita el JOIN en la consulta más común (créditos pendientes de un partner)
  plan_id        BIGINT       NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  months         INT          NOT NULL CHECK (months >= 1),
  status         VARCHAR(20)  NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CLAIMED', 'REVOKED')),
  -- Reservado para el paso de canje (link único / registro público) que
  -- todavía no se construye en este script — se agrega ya para no correr
  -- otra migración después.
  token          VARCHAR(64)  UNIQUE,
  claimed_org_id BIGINT       REFERENCES organizations(id) ON DELETE SET NULL,
  claimed_at     TIMESTAMP,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_partner_credits_batch   ON partner_subscription_credits(batch_id);
CREATE INDEX IF NOT EXISTS idx_partner_credits_partner ON partner_subscription_credits(partner_id, status);

-- ============================================================
-- VERIFICACIÓN
-- ============================================================

SELECT
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'partner_credit_batches')      AS tabla_batches_creada,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'partner_subscription_credits') AS tabla_credits_creada,
  (SELECT COUNT(*) FROM partner_credit_batches)      AS total_batches,
  (SELECT COUNT(*) FROM partner_subscription_credits) AS total_creditos;
