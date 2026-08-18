-- ============================================================
-- PARTNERS 02: INFRAESTRUCTURA DE PARTNERS
-- Fecha: 2026-08-17
-- ============================================================
-- Crea el modelo de "partner" (incubadora/aceleradora) que monitorea
-- en solo lectura la adopción de organizaciones de su portafolio.
--
-- Este script:
--   1. Crea `partners` — tabla de plataforma (como subscription_plans),
--      NO una fila de organization_members. Un coordinador de partner
--      inicia sesión con Firebase como cualquier usuario; su fila en
--      `users` se vincula 1:1 vía partners.user_id — el mismo patrón
--      que ya usa el admin de plataforma (verifyAdmin() en lib/auth.ts,
--      que no depende de ninguna columna de rol en `users`).
--   2. Crea `partner_organizations` — relación N:N entre partners y
--      organizations (un partner ve N orgs; una org, en teoría, puede
--      ser vista por más de un partner, ej. graduó de una incubadora y
--      entró a otra). Incluye `share_financials`: por defecto el
--      partner NO ve montos/ingresos de la org — requiere opt-in
--      explícito (decisión de privacidad del emprendedor, no un flag
--      técnico nada más).
--   3. Agrega `paid_by_partner_id` a subscription_payments — permite
--      registrar que un partner patrocinó meses de plan a una org
--      (mismo mecanismo que un pago normal, ver
--      database/docs/partner-dashboard-architecture.md).
--
-- PRERREQUISITO: database/partners/01-migrate-subscription-payments.sql
--                ya ejecutado (org_id/org_subscription_id existen).
-- SEGURO DE EJECUTAR EN PRODUCCIÓN:
--   - Tablas nuevas con IF NOT EXISTS, no toca datos existentes.
--   - La columna nueva en subscription_payments es nullable.
-- ============================================================

-- ============================================================
-- PASO 1: partners
-- ============================================================

CREATE TABLE IF NOT EXISTS partners (
  id           BIGSERIAL    PRIMARY KEY,
  name         VARCHAR(255) NOT NULL,             -- "Aceleradora Terra"
  contact_name VARCHAR(255),
  email        VARCHAR(255) NOT NULL UNIQUE,
  phone        VARCHAR(30),
  user_id      BIGINT       REFERENCES users(id), -- login del coordinador (Firebase, como cualquier usuario)
  is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_partners_user ON partners(user_id);

-- ============================================================
-- PASO 2: partner_organizations
-- ============================================================

CREATE TABLE IF NOT EXISTS partner_organizations (
  id               BIGSERIAL PRIMARY KEY,
  partner_id       BIGINT    NOT NULL REFERENCES partners(id)      ON DELETE CASCADE,
  org_id           BIGINT    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  share_financials BOOLEAN   NOT NULL DEFAULT FALSE, -- opt-in: ¿la org autorizó que el partner vea montos/ingresos?
  linked_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (partner_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_partner_orgs_partner ON partner_organizations(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_orgs_org     ON partner_organizations(org_id);

-- ============================================================
-- PASO 3: subscription_payments — vincular pagos patrocinados por un partner
-- ============================================================

ALTER TABLE subscription_payments
  ADD COLUMN IF NOT EXISTS paid_by_partner_id BIGINT REFERENCES partners(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_subscription_payments_partner ON subscription_payments(paid_by_partner_id);

-- ============================================================
-- VERIFICACIÓN
-- ============================================================

SELECT
  (SELECT COUNT(*) FROM partners)              AS total_partners,
  (SELECT COUNT(*) FROM partner_organizations) AS total_vinculos,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'subscription_payments' AND column_name = 'paid_by_partner_id') AS columna_agregada;
