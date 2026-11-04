-- ORDEN DE DESPLIEGUE OBLIGATORIO: ejecutar 01, 02, 03, 04 y 05 en producción,
-- en ese orden, ANTES de desplegar el código que consume estas migraciones.
--
-- Plan Gratis usado como plan efectivo cuando una suscripción facturable
-- permanece PAST_DUE después de su período de gracia.
-- Idempotente y preparado para ejecución manual en producción.
-- ADVERTENCIA: reejecutar este archivo restaura los límites y features
-- declarados abajo; por tanto, pisa ajustes manuales hechos al plan Gratis.

BEGIN;

INSERT INTO subscription_plans (
  name,
  slug,
  description,
  price_usd,
  billing_interval,
  max_products,
  max_sales_per_month,
  max_storage_mb,
  max_accounts,
  max_supplies,
  max_transactions_per_month,
  max_users,
  max_warehouses,
  is_active
)
VALUES (
  'Gratis',
  'free',
  'Plan gratuito con las funciones esenciales para ordenar un negocio.',
  0.00,
  'MONTHLY',
  30,
  100,
  NULL,
  2,
  0,
  NULL,
  1,
  1,
  TRUE
)
ON CONFLICT (slug) DO UPDATE SET
  name                       = EXCLUDED.name,
  description                = EXCLUDED.description,
  price_usd                  = EXCLUDED.price_usd,
  billing_interval           = EXCLUDED.billing_interval,
  max_products               = EXCLUDED.max_products,
  max_sales_per_month        = EXCLUDED.max_sales_per_month,
  max_storage_mb             = EXCLUDED.max_storage_mb,
  max_accounts               = EXCLUDED.max_accounts,
  max_supplies               = EXCLUDED.max_supplies,
  max_transactions_per_month = EXCLUDED.max_transactions_per_month,
  max_users                  = EXCLUDED.max_users,
  max_warehouses             = EXCLUDED.max_warehouses,
  is_active                  = TRUE,
  updated_at                 = CURRENT_TIMESTAMP;

-- Mapeo de la columna "Gratis" de components/landing/landing-pricing.tsx
-- a las feature keys reales consumidas por requireFeature:
--
--   Productos activos (30)        -> products.create + inventory.view
--   Ventas (100/mes)              -> sales.create + sales.view
--   Cuentas financieras (2)       -> finances.accounts
--   Transacciones                 -> finances.transactions
--   Tarjetas de crédito           -> excluidas (finances.credit_cards)
--   Movimientos de inventario     -> excluidos (inventory.movements)
--   Categorías personalizadas    -> excluidas (finances.custom_categories);
--                                    las predeterminadas siguen disponibles
--   Reporte de ventas             -> reports.sales
--
-- Filas excluidas mediante ausencia de feature:
--   clientes                      -> customers.manage
--   fidelización                 -> customers.loyalty
--   eventos                       -> events.manage / events.inventory
--   compras                       -> inventory.purchases
--   insumos                       -> límite max_supplies = 0
--   equipo                        -> admin.multi_user + max_users = 1
--   otros reportes                -> reports.inventory / reports.profit /
--                                    reports.events
--
-- Otras superficies sin feature key propia:
--   Panel general, perfil y suscripción no usan requireFeature.
--   inventory.view sigue siendo necesario para listar productos y bodegas.
--   Las separaciones de movimientos y categorías personalizadas se crean
--   en 04-inventory-movements-categories-features.sql.

-- Asegura el subconjunto de claves que Gratis necesita incluso si el seed del
-- catálogo no se ejecutó completo en un ambiente antiguo.
INSERT INTO system_features (feature_key, feature_name, category) VALUES
  ('products.create',       'Crear productos',       'PRODUCTS'),
  ('inventory.view',        'Ver inventario',        'INVENTORY'),
  ('sales.create',          'Crear ventas',          'SALES'),
  ('sales.view',            'Ver historial de ventas', 'SALES'),
  ('finances.accounts',     'Cuentas financieras',   'FINANCES'),
  ('finances.transactions', 'Transacciones',         'FINANCES'),
  ('reports.sales',         'Reporte de ventas',     'REPORTS')
ON CONFLICT (feature_key) DO NOTHING;

-- Si el plan ya existía, primero deja todas sus features apagadas para que
-- una ejecución repetida también elimine cualquier acceso extra accidental.
UPDATE plan_features
SET is_enabled = FALSE
WHERE plan_id = (SELECT id FROM subscription_plans WHERE slug = 'free');

INSERT INTO plan_features (plan_id, feature_id, is_enabled)
SELECT p.id, f.id, TRUE
FROM subscription_plans p
JOIN system_features f ON f.feature_key IN (
  'products.create',
  'inventory.view',
  'sales.create',
  'sales.view',
  'finances.accounts',
  'finances.transactions',
  'reports.sales'
)
WHERE p.slug = 'free'
ON CONFLICT (plan_id, feature_id) DO UPDATE SET
  is_enabled = EXCLUDED.is_enabled;

COMMIT;
