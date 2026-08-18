-- ============================================================
-- PARTNERS 01: MIGRAR subscription_payments A ORGANIZACIONES
-- Fecha: 2026-08-17
-- ============================================================
-- subscription_payments existe desde ddl.v2/v3 pero nunca se migró al
-- modelo multi-org (v4) ni la usa ningún endpoint hoy — apunta al modelo
-- viejo: user_id + subscription_id (FK a user_subscriptions).
--
-- Este script:
--   1. Agrega org_id + org_subscription_id (apuntando a org_subscriptions).
--   2. Agrega months_purchased + covers_period_start/end, para poder
--      registrar pagos manuales (no recurrentes) de cualquier duración
--      y conservar qué período cubrió cada pago específico — necesario
--      porque org_subscriptions.current_period_end se sobrescribe en
--      cada renovación y se perdería el historial.
--   3. Backfillea org_id/org_subscription_id desde el user_id existente.
--   4. Deja user_id nullable (igual que v4.4 con las 24 tablas de datos)
--      — el código nuevo insertará usando org_id, no el modelo viejo.
--
-- NO agrega todavía paid_by_partner_id — llega en partners/02, cuando
-- exista la tabla partners.
--
-- PRERREQUISITO: v4-multi-org-infrastructure.sql ya ejecutado.
-- SEGURO DE EJECUTAR EN PRODUCCIÓN:
--   - Solo agrega columnas nuevas (nullable al inicio).
--   - UPDATE idempotente: si org_id ya tiene valor, no lo pisa.
--   - subscription_payments no tiene código que la use hoy — bajo riesgo.
-- ============================================================

-- ============================================================
-- SECCIÓN 1: COLUMNAS NUEVAS (nullable, instantáneo)
-- ============================================================

ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS org_id BIGINT REFERENCES organizations(id);
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS org_subscription_id BIGINT REFERENCES org_subscriptions(id);
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS months_purchased INT;
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS covers_period_start TIMESTAMP;
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS covers_period_end   TIMESTAMP;

ALTER TABLE subscription_payments
  ADD CONSTRAINT chk_subscription_payments_months
  CHECK (months_purchased IS NULL OR months_purchased > 0);

-- ============================================================
-- SECCIÓN 2: POBLAR org_id / org_subscription_id DESDE user_id
-- Solo actualiza filas donde aún es NULL (idempotente).
-- ============================================================

UPDATE subscription_payments sp
SET org_id = o.id
FROM organizations o
WHERE o.owner_user_id = sp.user_id AND sp.org_id IS NULL;

UPDATE subscription_payments sp
SET org_subscription_id = os.id
FROM org_subscriptions os
WHERE os.org_id = sp.org_id AND sp.org_subscription_id IS NULL;

-- ============================================================
-- SECCIÓN 3: VERIFICACIÓN
-- Ejecutar antes de continuar a la Sección 4. Debe devolver 0.
-- Si devuelve > 0, hay pagos de usuarios sin organización — revisar
-- antes de seguir (no debería pasar si v4 ya corrió completo).
-- ============================================================

SELECT COUNT(*) AS pagos_sin_org FROM subscription_payments WHERE org_id IS NULL;

-- ============================================================
-- SECCIÓN 4: RELAJAR EL MODELO VIEJO + ÍNDICES
-- Ejecutar SOLO si la Sección 3 devolvió 0.
-- ============================================================

ALTER TABLE subscription_payments ALTER COLUMN user_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscription_payments_org     ON subscription_payments(org_id);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_org_sub ON subscription_payments(org_subscription_id);

-- ============================================================
-- VERIFICACIÓN FINAL
-- ============================================================

SELECT
  (SELECT COUNT(*) FROM subscription_payments)                              AS total_pagos,
  (SELECT COUNT(*) FROM subscription_payments WHERE org_id IS NOT NULL)     AS con_org_id,
  (SELECT COUNT(*) FROM subscription_payments WHERE org_subscription_id IS NOT NULL) AS con_org_subscription_id;
