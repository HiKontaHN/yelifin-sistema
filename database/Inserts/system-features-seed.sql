-- Seed idempotente de system_features (se puede correr varias veces).
-- Solo crea el catálogo de features; el estado por plan (plan_features)
-- se administra desde el servicio central de administración.

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
-- REPORTS (granulares — cada reporte se puede prender/apagar por plan)
('reports.sales',         'Reporte de ventas',            'REPORTS'),
('reports.inventory',     'Reporte de inventario',        'REPORTS'),
('reports.profit',        'Reporte de rentabilidad',      'REPORTS'),
('reports.events',        'Reporte de eventos',           'REPORTS'),
('reports.basic',         'Reportes básicos',             'REPORTS'),
('reports.advanced',      'Reportes avanzados',           'REPORTS'),
-- ADMIN
('admin.multi_user',      'Múltiples usuarios',           'ADMIN'),
('admin.export',          'Exportar datos',               'ADMIN')
ON CONFLICT (feature_key) DO NOTHING;
