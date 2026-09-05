-- ============================================================
-- MIGRACIÓN v4.21: SUBITEM ADMIN.WAREHOUSES + ENFORCEMENT REAL
-- Fecha: 2026-09-05
-- ============================================================
-- Agrega "Bodegas" como tercer subitem del módulo ADMIN (junto a Equipo y
-- Roles) — mismo patrón que v4.17 al dividir un módulo existente. Antes
-- de esta migración, gestionar el equipo y las bodegas estaba protegido
-- con un chequeo de isOwner() directo en el código, sin pasar por
-- org_role_permissions en absoluto — ni siquiera el subitem ADMIN.TEAM
-- ya existente tenía efecto real. A partir de esta migración + el código
-- que la acompaña, un rol con ADMIN.TEAM/ADMIN.WAREHOUSES puede
-- administrar equipo/bodegas sin ser el dueño de la organización.
--
-- Cada rol existente recibe la fila ADMIN.WAREHOUSES copiando los mismos
-- flags que ya tenía en ADMIN.TEAM — ningún rol pierde ni gana acceso
-- por sorpresa; el dueño decide después, desde /settings/roles, quién
-- más debería tener este permiso.
-- ============================================================

-- El CHECK debe actualizarse ANTES del backfill — si no, el INSERT de
-- abajo se valida contra la constraint vieja (que aún no permite
-- ADMIN.WAREHOUSES) y falla con 23514.
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
  (module = 'ADMIN'     AND subitem IN ('TEAM','ROLES','WAREHOUSES'))
);

INSERT INTO org_role_permissions (role_id, module, subitem, can_view, can_edit, can_delete, show_costs, show_profit)
SELECT p.role_id, 'ADMIN', 'WAREHOUSES', p.can_view, p.can_edit, p.can_delete, p.show_costs, p.show_profit
FROM org_role_permissions p
WHERE p.module = 'ADMIN' AND p.subitem = 'TEAM'
ON CONFLICT (role_id, module, subitem) DO NOTHING;
