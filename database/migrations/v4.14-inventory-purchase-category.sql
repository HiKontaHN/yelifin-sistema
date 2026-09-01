-- ============================================================
-- MIGRACIÓN v4.14: CATEGORÍA "COMPRA DE INVENTARIO"
-- Fecha: 2026-09-01
-- ============================================================
-- Las compras de inventario (POST /api/purchases, PATCH de llegada
-- e import por Excel) creaban su transacción de gasto con
-- category = NULL, así que no aparecían en ningún reporte por
-- categoría. A partir de ahora todas se categorizan como
-- "Compra de Inventario".
--
-- La categoría sembrada por defecto se llamaba "Inventario"
-- (lib/seed-default-categories.ts); esta migración la renombra
-- para que exista una sola categoría y las transacciones que ya
-- la usaban sigan siendo consistentes.
--
-- transactions.category y credit_card_transactions.category son
-- texto libre con el NOMBRE de la categoría (no hay FK contra
-- transaction_categories), por eso el renombrado exige actualizar
-- también las transacciones que guardaban el nombre viejo.
--
-- SEGURO DE EJECUTAR EN PRODUCCIÓN:
--   - No borra filas ni columnas.
--   - Idempotente: correrla dos veces no cambia nada la segunda vez.
--   - El backfill solo toca filas con category NULL o 'Inventario'.
-- ============================================================

BEGIN;

-- ── 1. Renombrar la categoría existente ───────────────────────
-- Se salta las orgs que ya tengan "Compra de Inventario" para no
-- violar UNIQUE (org_id, name, type).
UPDATE transaction_categories tc
SET    name       = 'Compra de Inventario',
       updated_at = NOW()
WHERE  tc.name = 'Inventario'
  AND  tc.type = 'EXPENSE'
  AND  NOT EXISTS (
         SELECT 1 FROM transaction_categories x
         WHERE  x.org_id = tc.org_id
           AND  x.type   = 'EXPENSE'
           AND  x.name   = 'Compra de Inventario'
       );

-- ── 2. Desactivar la "Inventario" sobrante ────────────────────
-- Solo quedan las de orgs que ya tenían ambas: se desactiva la
-- vieja para no dejar dos opciones equivalentes en el dropdown.
UPDATE transaction_categories
SET    is_active  = FALSE,
       updated_at = NOW()
WHERE  name = 'Inventario'
  AND  type = 'EXPENSE'
  AND  is_active = TRUE;

-- ── 3. Crear la categoría en las orgs que no la tengan ────────
-- (orgs creadas antes del seed, o que hubieran borrado la suya)
INSERT INTO transaction_categories (org_id, created_by, name, type)
SELECT o.id, o.owner_user_id, 'Compra de Inventario', 'EXPENSE'
FROM   organizations o
ON CONFLICT (org_id, name, type) DO NOTHING;

-- ── 4. Backfill: transacciones de cuenta ligadas a compras ────
UPDATE transactions
SET    category = 'Compra de Inventario'
WHERE  reference_type IN ('PURCHASE', 'PURCHASE_SHIPPING')
  AND  (category IS NULL OR category = 'Inventario');

-- ── 5. Backfill: transacciones manuales con el nombre viejo ───
-- Consecuencia del renombrado del paso 1.
UPDATE transactions
SET    category = 'Compra de Inventario'
WHERE  category = 'Inventario';

-- ── 6. Backfill: cargos de tarjeta ligados a compras ──────────
-- purchase_batch_id existe desde v4.5-purchase-batch-cc-link.sql
UPDATE credit_card_transactions
SET    category = 'Compra de Inventario'
WHERE  purchase_batch_id IS NOT NULL
  AND  type = 'CHARGE'
  AND  (category IS NULL OR category = 'Inventario');

-- ── 7. Cargos de tarjeta manuales con el nombre viejo ─────────
UPDATE credit_card_transactions
SET    category = 'Compra de Inventario'
WHERE  category = 'Inventario';

COMMIT;

-- ── Verificación ──────────────────────────────────────────────
-- SELECT name, type, is_active, COUNT(*) FROM transaction_categories
--   WHERE name IN ('Inventario', 'Compra de Inventario')
--   GROUP BY name, type, is_active;
--
-- SELECT category, COUNT(*) FROM transactions
--   WHERE reference_type IN ('PURCHASE', 'PURCHASE_SHIPPING')
--   GROUP BY category;
