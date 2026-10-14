-- ============================================================
-- PARTNERS 06: UN SOLO PARTNER POR ORGANIZACIÓN
-- Fecha: 2026-10-14
-- ============================================================
-- Refuerza en PostgreSQL la misma regla aplicada por el flujo de canje:
-- una organización no puede vincularse simultáneamente a dos partners.
--
-- La migración NO elimina vínculos. Si encuentra datos históricos
-- duplicados se detiene para que se resuelvan manualmente antes de crear
-- la restricción única.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM partner_organizations
    GROUP BY org_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Hay organizaciones vinculadas a más de un partner; resuelva los duplicados antes de continuar';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_partner_organizations_org
  ON partner_organizations(org_id);

SELECT COUNT(*) AS organizaciones_vinculadas
FROM partner_organizations;
