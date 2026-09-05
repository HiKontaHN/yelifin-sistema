-- ============================================================
-- MIGRACIÓN v4.19: LÍMITE DE USUARIOS POR PLAN
-- Fecha: 2026-09-05
-- ============================================================
-- max_users está documentado como parte del schema original (ddl.v2.SQL)
-- pero nunca llegó a existir realmente en la tabla de producción — de
-- ahí que el UPDATE fallara con 42703 la primera vez. Esta migración
-- ahora la agrega explícitamente (mismo patrón que max_warehouses en
-- v4.20) y le pone tope real a cada plan:
--
--   trial   → 1 (mono-usuario, empuja a upgrade si quieren equipo)
--   basico  → 1 (igual)
--   pro     → 3 (el tope que motivó esta migración — más equipo por
--                fuera de esto se coordina manualmente con el dueño,
--                no hay cobro automático por asiento todavía)
--   original→ NULL (plan vitalicio de fundadores, ya tiene acceso
--                    completo a todo lo demás — sin tope)
--   admin   → NULL (cuentas internas de HiKonta, no de clientes)
--
-- NULL sigue significando "sin límite" en verifyResourceLimit (lib/auth.ts)
-- — igual que ya funciona para max_products/max_sales_per_month/etc.
-- ============================================================

ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS max_users INT;

UPDATE subscription_plans SET max_users = 1 WHERE slug = 'trial';
UPDATE subscription_plans SET max_users = 1 WHERE slug = 'basico';
UPDATE subscription_plans SET max_users = 3 WHERE slug = 'pro';
UPDATE subscription_plans SET max_users = NULL WHERE slug = 'original';
UPDATE subscription_plans SET max_users = NULL WHERE slug = 'admin';
