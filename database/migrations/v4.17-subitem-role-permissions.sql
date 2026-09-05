-- ============================================================
-- MIGRACIÓN v4.17: PERMISOS DE ROL A NIVEL DE SUBITEM
-- Fecha: 2026-09-04
-- ============================================================
-- org_role_permissions pasa de {role, module} (9 filas/rol) a
-- {role, module, subitem} (18 filas/rol). Cada fila existente se
-- conserva o se abre en N filas con los MISMOS flags — ningún rol
-- pierde acceso que ya tenía. Antes de correr: confirmar el nombre
-- real de la UNIQUE constraint existente con \d org_role_permissions.
--
-- Ver database/docs/public-id-and-permission-granularity-plan.md
-- (Parte 2) para el contexto completo: el catálogo de subitems, las
-- decisiones pendientes (A2/A3/A6), y los cambios de código en
-- lib/auth.ts, lib/permissions.ts y settings/roles/page.tsx que
-- acompañan esta migración.
-- ============================================================

ALTER TABLE org_role_permissions ADD COLUMN IF NOT EXISTS subitem VARCHAR(50);

UPDATE org_role_permissions SET subitem = module
WHERE module IN ('DASHBOARD','PRODUCTS','SALES','CUSTOMERS','EVENTS') AND subitem IS NULL;

-- INVENTORY → STOCK (reusa fila), + MOVEMENTS, INCOMING, SUPPLIES (copian flags)
UPDATE org_role_permissions SET subitem = 'STOCK' WHERE module = 'INVENTORY' AND subitem IS NULL;
INSERT INTO org_role_permissions (role_id, module, subitem, can_view, can_edit, can_delete, show_costs, show_profit)
SELECT p.role_id, 'INVENTORY', v.subitem, p.can_view, p.can_edit, p.can_delete, p.show_costs, p.show_profit
FROM org_role_permissions p CROSS JOIN (VALUES ('MOVEMENTS'),('INCOMING'),('SUPPLIES')) AS v(subitem)
WHERE p.module = 'INVENTORY' AND p.subitem = 'STOCK';

-- FINANCES → ACCOUNTS (reusa), + TRANSACTIONS, CREDIT_CARDS
UPDATE org_role_permissions SET subitem = 'ACCOUNTS' WHERE module = 'FINANCES' AND subitem IS NULL;
INSERT INTO org_role_permissions (role_id, module, subitem, can_view, can_edit, can_delete, show_costs, show_profit)
SELECT p.role_id, 'FINANCES', v.subitem, p.can_view, p.can_edit, p.can_delete, p.show_costs, p.show_profit
FROM org_role_permissions p CROSS JOIN (VALUES ('TRANSACTIONS'),('CREDIT_CARDS')) AS v(subitem)
WHERE p.module = 'FINANCES' AND p.subitem = 'ACCOUNTS';

-- REPORTS → SALES (reusa), + INVENTORY, PROFIT, EVENTS
UPDATE org_role_permissions SET subitem = 'SALES' WHERE module = 'REPORTS' AND subitem IS NULL;
INSERT INTO org_role_permissions (role_id, module, subitem, can_view, can_edit, can_delete, show_costs, show_profit)
SELECT p.role_id, 'REPORTS', v.subitem, p.can_view, p.can_edit, p.can_delete, p.show_costs, p.show_profit
FROM org_role_permissions p CROSS JOIN (VALUES ('INVENTORY'),('PROFIT'),('EVENTS')) AS v(subitem)
WHERE p.module = 'REPORTS' AND p.subitem = 'SALES';

-- ADMIN → TEAM (reusa), + ROLES — solo por paridad con la UI, no aplicado hoy
UPDATE org_role_permissions SET subitem = 'TEAM' WHERE module = 'ADMIN' AND subitem IS NULL;
INSERT INTO org_role_permissions (role_id, module, subitem, can_view, can_edit, can_delete, show_costs, show_profit)
SELECT p.role_id, 'ADMIN', 'ROLES', p.can_view, p.can_edit, p.can_delete, p.show_costs, p.show_profit
FROM org_role_permissions p WHERE p.module = 'ADMIN' AND p.subitem = 'TEAM';

UPDATE org_role_permissions SET subitem = module WHERE subitem IS NULL; -- red de seguridad

ALTER TABLE org_role_permissions ALTER COLUMN subitem SET NOT NULL;

-- Verificar el nombre real antes de correr:
-- SELECT conname FROM pg_constraint WHERE conrelid = 'org_role_permissions'::regclass AND contype = 'u';
ALTER TABLE org_role_permissions DROP CONSTRAINT IF EXISTS org_role_permissions_role_id_module_key;
ALTER TABLE org_role_permissions ADD CONSTRAINT org_role_permissions_role_module_subitem_key UNIQUE (role_id, module, subitem);

ALTER TABLE org_role_permissions DROP CONSTRAINT IF EXISTS org_role_permissions_module_check;
ALTER TABLE org_role_permissions ADD CONSTRAINT org_role_permissions_module_subitem_check CHECK (
  (module = 'DASHBOARD' AND subitem = 'DASHBOARD') OR
  (module = 'PRODUCTS'  AND subitem = 'PRODUCTS')  OR
  (module = 'SALES'     AND subitem = 'SALES')     OR
  (module = 'CUSTOMERS' AND subitem = 'CUSTOMERS') OR
  (module = 'EVENTS'    AND subitem = 'EVENTS')    OR
  (module = 'INVENTORY' AND subitem IN ('STOCK','MOVEMENTS','INCOMING','SUPPLIES')) OR
  (module = 'FINANCES'  AND subitem IN ('ACCOUNTS','TRANSACTIONS','CREDIT_CARDS'))  OR
  (module = 'REPORTS'   AND subitem IN ('SALES','INVENTORY','PROFIT','EVENTS'))     OR
  (module = 'ADMIN'     AND subitem IN ('TEAM','ROLES'))
);

CREATE INDEX IF NOT EXISTS idx_org_role_perms_role_module ON org_role_permissions(role_id, module);
