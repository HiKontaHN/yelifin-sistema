-- ============================================================
-- ADMIN PANEL — tabla de administradores de plataforma
-- ============================================================
-- Repo del panel: hikonta-admin (carpeta hermana de yelifin-sistema),
-- conectado directo a esta misma base de datos de Neon. Ver
-- database/docs/admin-panel-architecture.md para el detalle completo.
--
-- Reemplaza, PARA EL PANEL NUEVO, el mecanismo actual de "admin" =
-- subscription.planSlug === 'admin' (una fila de plan insertada a mano en
-- Neon, sin script versionado — ver hallazgo en
-- hikonta-partners/documentation/ideas-feasibility.md sesión previa) por
-- una tabla dedicada, mismo patrón que `partners` en hikonta-partners
-- (database/partners/02-partners-infrastructure.sql).
--
-- IMPORTANTE — esto NO reemplaza planSlug === 'admin' dentro de
-- yelifin-sistema. Ese mecanismo sigue vivo y se usa para el bypass de
-- feature-gating dentro del producto (ver components/shared/feature-gate.tsx,
-- hooks/use-plan-guard.ts, components/app-sidebar.tsx) — es una decisión de
-- producto distinta ("el plan admin ve todo dentro de HiKonta") y no se toca
-- acá. `admins` es exclusivamente la puerta de entrada al panel hikonta-admin.

CREATE TABLE IF NOT EXISTS admins (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admins_user ON admins(user_id);

-- Sembrado: vincula como admin a cualquier usuario cuya org actual tenga el
-- plan 'admin' — migra el estado implícito de hoy a la tabla nueva sin tener
-- que adivinar un user_id a mano. Idempotente (UNIQUE en user_id).
INSERT INTO admins (user_id)
SELECT DISTINCT o.owner_user_id
FROM organizations o
JOIN org_subscriptions   os ON os.org_id  = o.id
JOIN subscription_plans  sp ON sp.id      = os.plan_id
WHERE sp.slug = 'admin'
ON CONFLICT (user_id) DO NOTHING;

-- Verificación manual sugerida después de correr esto:
--   SELECT a.id, a.is_active, u.email FROM admins a JOIN users u ON u.id = a.user_id;
-- Si el sembrado no encontró filas (porque el plan 'admin' se asignó de otra
-- forma en Neon), agregar el primer admin a mano:
--   INSERT INTO admins (user_id) VALUES (<user_id>);
