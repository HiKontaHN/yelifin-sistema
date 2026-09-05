-- ============================================================
-- MIGRACIÓN v4.19: LÍMITE DE USUARIOS POR PLAN
-- Fecha: 2026-09-05
-- ============================================================
-- max_users existe en subscription_plans desde el schema original pero
-- ningún plan lo tiene configurado hoy (queda en su DEFAULT/NULL) — un
-- owner en cualquier plan puede agregar miembros de equipo ilimitados,
-- sin ningún control. Esta migración le pone tope real a cada plan:
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

UPDATE subscription_plans SET max_users = 1 WHERE slug = 'trial';
UPDATE subscription_plans SET max_users = 1 WHERE slug = 'basico';
UPDATE subscription_plans SET max_users = 3 WHERE slug = 'pro';
UPDATE subscription_plans SET max_users = NULL WHERE slug = 'original';
UPDATE subscription_plans SET max_users = NULL WHERE slug = 'admin';
