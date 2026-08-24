-- =========================
-- PLANES
-- =========================
INSERT INTO subscription_plans (name, slug, description, price_usd, billing_interval, max_products, max_sales_per_month, max_storage_mb, max_accounts, max_supplies) VALUES
(
  'Trial',
  'trial',
  'Plan gratuito con funciones básicas. Sin fecha de expiración.',
  0.00, 'MONTHLY', 10, 50, 100, NULL, NULL
),
(
  'Original',
  'original',
  'Plan gratuito de por vida para usuarios fundadores de .',
  0.00, 'LIFETIME', NULL, NULL, 500, NULL, NULL
),
(
  'Básico',
  'basico',
  'Plan intermedio para negocios en crecimiento: más productos, clientes, fidelización, eventos y reportes de inventario.',
  8.99, 'MONTHLY', 500, NULL, 1024, 5, 5  -- $8.99 USD/mes · ISV incluido
),
(
  'Pro',
  'pro',
  'Plan profesional con acceso completo a todas las funciones.',
  12.99, 'MONTHLY', NULL, NULL, 2048, NULL, NULL  -- $12.99 USD/mes · ISV incluido
);

-- =========================
-- FEATURES
-- =========================
INSERT INTO system_features (feature_key, feature_name, category) VALUES
-- PRODUCTS
('products.create',       'Crear productos',              'PRODUCTS'),
('products.variants',     'Variantes de productos',       'PRODUCTS'),
('products.bulk_import',  'Importación masiva',           'PRODUCTS'),
-- INVENTORY
('inventory.view',        'Ver inventario',               'INVENTORY'),
('inventory.adjust',      'Ajustar inventario',           'INVENTORY'),
('inventory.purchases',   'Compras / lotes',              'INVENTORY'),
-- SALES
('sales.create',          'Crear ventas',                 'SALES'),
('sales.view',            'Ver historial de ventas',      'SALES'),
('sales.reports',         'Reportes de ventas',           'SALES'),
-- CUSTOMERS
('customers.manage',      'Gestión de clientes',          'CUSTOMERS'),
('customers.loyalty',     'Programa de lealtad',          'CUSTOMERS'),
-- FINANCES
('finances.accounts',     'Cuentas financieras',          'FINANCES'),
('finances.transactions', 'Transacciones',                'FINANCES'),
('finances.reports',      'Reportes financieros',         'FINANCES'),
-- EVENTS
('events.manage',         'Gestión de eventos',           'EVENTS'),
('events.inventory',      'Inventario por evento',        'EVENTS'),
-- REPORTS
('reports.basic',         'Reportes básicos',             'REPORTS'),
('reports.advanced',      'Reportes avanzados',           'REPORTS'),
-- ADMIN
('admin.multi_user',      'Múltiples usuarios',           'ADMIN'),
('admin.export',          'Exportar datos',               'ADMIN');

-- =========================
-- FEATURES POR PLAN
-- =========================

-- TRIAL: funciones básicas
INSERT INTO plan_features (plan_id, feature_id, is_enabled)
SELECT
  (SELECT id FROM subscription_plans WHERE slug = 'trial'),
  id,
  TRUE
FROM system_features
WHERE feature_key IN (
  'products.create',
  'inventory.view',
  'inventory.adjust',
  'sales.create',
  'sales.view',
  'customers.manage',
  'finances.accounts',
  'finances.transactions',
  'reports.basic'
);

-- ORIGINAL: todo excepto multi_user, export y bulk_import
INSERT INTO plan_features (plan_id, feature_id, is_enabled)
SELECT
  (SELECT id FROM subscription_plans WHERE slug = 'original'),
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
);

-- PRO: todas las features
INSERT INTO plan_features (plan_id, feature_id, is_enabled)
SELECT
  (SELECT id FROM subscription_plans WHERE slug = 'pro'),
  id,
  TRUE
FROM system_features;