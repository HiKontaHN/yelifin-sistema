-- ============================================================
-- PARTNERS 04: CÓDIGOS DE INVITACIÓN
-- Fecha: 2026-08-19
-- ============================================================
-- Resuelve la pregunta abierta #6 de
-- database/docs/partner-dashboard-architecture.md: "¿Cómo se vincula una
-- org a un partner?". Hasta hoy solo existía el seed manual de dev
-- (03-seed-test-data.sql) — no había forma real de que un partner sumara
-- organizaciones a su portafolio.
--
-- Diseño: el partner genera un código desde hikonta-partners (INSERT en
-- esta tabla, ver app/api/partner/invites en ese repo). El emprendedor es
-- SIEMPRE quien lo canjea — nunca el partner vincula unilateralmente,
-- mismo espíritu de opt-in que `share_financials` en 02. Un mismo código
-- sirve para los dos caminos que describe el partner:
--   a) Enlace de registro:  /register?ref=CODIGO  → se canjea automático
--      al crear la cuenta (ver app/api/auth/register).
--   b) Código para usuario ya existente → lo ingresa en
--      Configuración > Organización (ver app/api/organization/link-partner).
--
-- SEGURO DE EJECUTAR EN PRODUCCIÓN: tabla nueva con IF NOT EXISTS, no toca
-- datos existentes.
-- PRERREQUISITO: database/partners/02-partners-infrastructure.sql
--                ya ejecutado (partners + partner_organizations existen).
-- ============================================================

CREATE TABLE IF NOT EXISTS partner_invite_codes (
  id                 BIGSERIAL    PRIMARY KEY,
  partner_id         BIGINT       NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  code               VARCHAR(12)  NOT NULL UNIQUE,
  created_by_user_id BIGINT       REFERENCES users(id),
  expires_at         TIMESTAMP    NOT NULL,
  -- Cancelado a mano por el partner antes de usarse o vencer (ver DELETE
  -- /api/partner/invites/[id] en hikonta-partners) — se conserva la fila
  -- para historial en vez de borrarla.
  revoked_at         TIMESTAMP,
  used_at            TIMESTAMP,
  used_by_org_id     BIGINT       REFERENCES organizations(id) ON DELETE SET NULL,
  created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_partner_invite_codes_partner ON partner_invite_codes(partner_id);

-- ============================================================
-- VERIFICACIÓN
-- ============================================================

SELECT
  (SELECT COUNT(*) FROM partner_invite_codes) AS total_codigos,
  (SELECT COUNT(*) FROM information_schema.tables
     WHERE table_name = 'partner_invite_codes') AS tabla_creada;
