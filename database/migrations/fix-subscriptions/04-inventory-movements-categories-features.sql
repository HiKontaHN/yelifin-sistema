-- ORDEN DE DESPLIEGUE OBLIGATORIO: ejecutar 01, 02, 03 y 04 en producción,
-- en ese orden, ANTES de desplegar el código que consume estas migraciones.
--
-- Permisos independientes para movimientos de inventario y categorías
-- financieras personalizadas. Idempotente; ignora planes ausentes por slug.

BEGIN;

INSERT INTO system_features (feature_key, feature_name, category) VALUES
  ('inventory.movements', 'Movimientos de inventario', 'INVENTORY'),
  ('finances.custom_categories', 'Categorías financieras personalizadas', 'FINANCES')
ON CONFLICT (feature_key) DO NOTHING;

INSERT INTO plan_features (plan_id, feature_id, is_enabled)
SELECT p.id, f.id, TRUE
FROM subscription_plans p
JOIN system_features f ON f.feature_key IN (
  'inventory.movements',
  'finances.custom_categories'
)
WHERE p.slug IN ('basico', 'pro', 'original', 'admin')
ON CONFLICT (plan_id, feature_id) DO UPDATE SET
  is_enabled = EXCLUDED.is_enabled;

-- Una reejecución corrige habilitaciones accidentales. Trial y Gratis no
-- incluyen estas operaciones; las categorías predeterminadas siguen siendo
-- legibles mediante finances.transactions.
UPDATE plan_features pf
SET is_enabled = FALSE
FROM subscription_plans p, system_features f
WHERE pf.plan_id = p.id
  AND pf.feature_id = f.id
  AND p.slug IN ('free', 'trial')
  AND f.feature_key IN (
    'inventory.movements',
    'finances.custom_categories'
  );

COMMIT;
