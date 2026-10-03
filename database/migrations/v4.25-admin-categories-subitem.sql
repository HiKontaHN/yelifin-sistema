-- ============================================================
-- MIGRACIÓN v4.25: SUBITEM ADMIN.CATEGORIES
-- Fecha: 2026-09-30
-- ============================================================
-- Agrega "Categorías" como cuarto subitem del módulo ADMIN — mismo patrón
-- que v4.21 (WAREHOUSES). Antes la página /settings/categories era solo
-- del dueño (OwnerGuard) y las mutaciones del API usaban
-- FINANCES.TRANSACTIONS. A partir de esta migración + el código que la
-- acompaña, crear/editar/eliminar categorías exige ADMIN.CATEGORIES; leer
-- sigue con FINANCES.TRANSACTIONS (el form de transacciones necesita la
-- lista).
--
-- Cada rol existente recibe la fila ADMIN.CATEGORIES copiando los flags
-- que ya tenía en ADMIN.TEAM — ningún rol pierde ni gana acceso por
-- sorpresa.
--
-- Correr ANTES de desplegar el código: lib/permissions.ts ya incluye
-- CATEGORIES y POST/PATCH de roles insertan esa fila, que la constraint
-- vieja rechaza con 23514.
-- ============================================================

ALTER TABLE org_role_permissions DROP CONSTRAINT IF EXISTS org_role_permissions_module_subitem_check;
ALTER TABLE org_role_permissions ADD CONSTRAINT org_role_permissions_module_subitem_check CHECK (
  (module = 'DASHBOARD' AND subitem = 'DASHBOARD') OR
  (module = 'PRODUCTS'  AND subitem = 'PRODUCTS')  OR
  (module = 'SALES'     AND subitem = 'SALES')     OR
  (module = 'CUSTOMERS' AND subitem = 'CUSTOMERS') OR
  (module = 'EVENTS'    AND subitem = 'EVENTS')    OR
  (module = 'INVENTORY' AND subitem IN ('STOCK','MOVEMENTS','INCOMING','SUPPLIES')) OR
  (module = 'FINANCES'  AND subitem IN ('ACCOUNTS','TRANSACTIONS','CREDIT_CARDS'))  OR
  (module = 'REPORTS'   AND subitem IN ('SALES','INVENTORY','PROFIT','EVENTS'))     OR
  (module = 'ADMIN'     AND subitem IN ('TEAM','ROLES','WAREHOUSES','CATEGORIES'))
);

INSERT INTO org_role_permissions (role_id, module, subitem, can_view, can_edit, can_delete, show_costs, show_profit)
SELECT p.role_id, 'ADMIN', 'CATEGORIES', p.can_view, p.can_edit, p.can_delete, p.show_costs, p.show_profit
FROM org_role_permissions p
WHERE p.module = 'ADMIN' AND p.subitem = 'TEAM'
ON CONFLICT (role_id, module, subitem) DO NOTHING;
