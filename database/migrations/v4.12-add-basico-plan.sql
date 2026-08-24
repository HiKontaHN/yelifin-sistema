-- ============================================================
-- MIGRACIÓN v4.12: CREAR PLAN "BÁSICO"
-- ============================================================
-- subscription_plans solo tenía Trial, Original y Pro (ver
-- database/Inserts/plans-and-suscriptions.sql). El landing
-- (components/landing/landing-pricing.tsx) ya muestra un plan
-- intermedio "Básico" a $8.99 USD/mes que nunca se creó en la BD.
--
-- Límites y features tomados de la matriz de landing-pricing.tsx:
--   - 500 productos, ventas ilimitadas
--   - 5 cuentas financieras, 5 suministros
--   - Clientes y fidelización, eventos, reportes de ventas e inventario
-- max_storage_mb (1024) no está definido en el landing; es un valor
-- intermedio entre Trial (100) y Pro (2048) — ajústalo si tienes una
-- cifra real.
--
-- Nota: reportería/features como "tarjetas de crédito", "mercancía en
-- camino", "rentabilidad" y "reportes de eventos" son exclusivas de
-- Pro en el landing pero no tienen feature_key propio en
-- system_features todavía, así que no se pueden excluir aquí vía
-- plan_features; si se gatea, hoy tendría que ser por slug de plan.
--
-- SEGURO DE EJECUTAR EN PRODUCCIÓN:
--   - Solo inserta filas nuevas (ON CONFLICT DO NOTHING).
--   - No modifica ni borra planes existentes.
-- ============================================================

INSERT INTO subscription_plans (
  name, slug, description, price_usd, billing_interval,
  max_products, max_sales_per_month, max_storage_mb,
  max_accounts, max_supplies
) VALUES (
  'Básico',
  'basico',
  'Plan intermedio para negocios en crecimiento: más productos, clientes, fidelización, eventos y reportes de inventario.',
  8.99, 'MONTHLY', 500, NULL, 1024, 5, 5
)
ON CONFLICT (slug) DO NOTHING;

-- Features del plan Básico: todo lo del Trial, más clientes/fidelización,
-- compras de inventario, eventos y reportes avanzados. Igual que
-- 'original', excepto bulk_import, multi_user y export (exclusivas de Pro).
INSERT INTO plan_features (plan_id, feature_id, is_enabled)
SELECT
  (SELECT id FROM subscription_plans WHERE slug = 'basico'),
  id,
  TRUE
FROM system_features
WHERE feature_key IN (
  'products.create',
  'products.variants',
  'inventory.view',
  'inventory.adjust',
  'inventory.purchases',
  'sales.create',
  'sales.view',
  'sales.reports',
  'customers.manage',
  'customers.loyalty',
  'finances.accounts',
  'finances.transactions',
  'finances.reports',
  'events.manage',
  'events.inventory',
  'reports.basic',
  'reports.advanced'
)
ON CONFLICT (plan_id, feature_id) DO NOTHING;
