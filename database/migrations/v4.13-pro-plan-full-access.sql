-- ============================================================
-- MIGRACIÓN v4.13: RESTAURAR ACCESO TOTAL DEL PLAN "PRO"
-- ============================================================
-- El insert original de plan_features para 'pro' (ver
-- database/Inserts/plans-and-suscriptions.sql) hizo
-- `SELECT id FROM system_features` una sola vez, en el momento en
-- que corrió. Features agregadas después vía system-features-seed.sql
-- (reports.sales, reports.inventory, reports.profit, reports.events,
-- y cualquier otra que se sume a futuro) nunca quedaron vinculadas a
-- plan_features para Pro — y verifyFeatureAccess() (lib/auth.ts) niega
-- acceso si no existe la fila con is_enabled = TRUE, así que Pro queda
-- bloqueado en funciones que debería tener por ser el plan tope.
--
-- Esta migración vincula TODAS las features activas al plan 'pro' y
-- las deja en TRUE, sin importar si ya tenían una fila (is_enabled en
-- FALSE por un toggle previo en /admin/plans, o si faltaba por
-- completo). Vuelve a correr sin problema si se agregan features
-- nuevas en el futuro — basta con re-ejecutar este archivo.
--
-- SEGURO DE EJECUTAR EN PRODUCCIÓN:
--   - Solo hace upsert de filas en plan_features (INSERT ... ON CONFLICT
--     DO UPDATE), no borra nada ni toca otros planes.
-- ============================================================

INSERT INTO plan_features (plan_id, feature_id, is_enabled)
SELECT
  (SELECT id FROM subscription_plans WHERE slug = 'pro'),
  sf.id,
  TRUE
FROM system_features sf
WHERE sf.is_active = TRUE
ON CONFLICT (plan_id, feature_id) DO UPDATE SET is_enabled = TRUE;
