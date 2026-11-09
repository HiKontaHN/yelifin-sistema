-- v4.37: soft delete de suministros.
-- Permite desactivar un suministro ya usado en ventas, compras o movimientos
-- sin borrar el historial (las FKs usan ON DELETE RESTRICT).

ALTER TABLE supplies
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE supplies DROP CONSTRAINT IF EXISTS supplies_org_id_name_key;
ALTER TABLE supplies DROP CONSTRAINT IF EXISTS supplies_user_id_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_supplies_one_active_name_per_org
  ON supplies (org_id, name)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_supplies_org_active
  ON supplies (org_id)
  WHERE is_active = TRUE;
