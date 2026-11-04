-- ================================================================
-- FIX TIME ZONE / 04
-- El fallback de persistencia debe ser neutral. El registro de una
-- organización nueva guarda explícitamente la zona IANA del navegador.
-- ================================================================

ALTER TABLE organizations
  ALTER COLUMN timezone SET DEFAULT 'UTC';

