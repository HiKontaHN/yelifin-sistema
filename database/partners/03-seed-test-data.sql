-- ============================================================
-- PARTNERS 03: DATOS DE PRUEBA (solo desarrollo)
-- Fecha: 2026-08-18
-- ============================================================
-- Crea un partner de prueba y lo vincula a organizaciones REALES que ya
-- existen en la base — no inventa datos sintéticos (sales/transactions
-- ya existentes se reutilizan tal cual para "última actividad").
--
-- id=1 coincide con NEXT_PUBLIC_BYPASS_PARTNER_ID en hikonta-partners/.env.local
-- (el bypass de auth usa ese id directamente, sin loguearse).
--
-- Mezcla deliberada de orgs activas/inactivas para poder ver ambos
-- estados en la tabla de "Emprendedores" y en el % de adopción:
--   6  Jelly Finds            — activa (688 ventas, la más reciente ayer)
--   5  DEVSLS                 — activa (49 ventas, reciente)
--   1  Panda cafe y flores    — inactiva (1 venta, de marzo)
--   3  Mi emprendimiento      — inactiva (sin ventas)
--   9  Tienda de computadora  — inactiva (sin ventas)
--   14 Filabella Crochet      — inactiva (sin ventas)
--
-- ⚠️ SOLO PARA DEV/STAGING. Borra estas filas (o cambia el id del
-- partner) antes de usar esta base con partners reales.
-- PRERREQUISITO: database/partners/01 y 02 ya ejecutados.
-- ============================================================

INSERT INTO partners (id, name, contact_name, email, phone, is_active)
VALUES (1, 'Aceleradora Demo', 'Coordinador de Prueba', 'demo@hikonta-partners.local', '+504 0000-0000', TRUE)
ON CONFLICT (id) DO UPDATE SET is_active = TRUE;

-- Evita colisión de ids en el próximo INSERT sin id explícito
SELECT setval(pg_get_serial_sequence('partners', 'id'), GREATEST((SELECT MAX(id) FROM partners), 1));

INSERT INTO partner_organizations (partner_id, org_id, share_financials)
VALUES
  (1, 6, TRUE),
  (1, 5, TRUE),
  (1, 1, FALSE),
  (1, 3, FALSE),
  (1, 9, FALSE),
  (1, 14, FALSE)
ON CONFLICT (partner_id, org_id) DO NOTHING;

-- Verificación
SELECT p.id, p.name, COUNT(po.org_id) AS orgs_vinculadas
FROM partners p
LEFT JOIN partner_organizations po ON po.partner_id = p.id
WHERE p.id = 1
GROUP BY p.id, p.name;
