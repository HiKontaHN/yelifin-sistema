-- ============================================================
-- MIGRACIÓN v4.26: ASIGNACIONES FIFO POR LÍNEA DE VENTA
-- Fecha: 2026-10-12
-- ============================================================
-- Conserva los lotes exactos consumidos por cada sale_item. Esto permite
-- editar o cancelar una venta sin devolver todo al lote más antiguo y sin
-- alterar el costo FIFO histórico.
--
-- La tabla empieza vacía: las ventas anteriores a esta migración usan el
-- mecanismo de compatibilidad de la aplicación porque no es posible
-- reconstruir con certeza sus lotes originales.
-- ============================================================

CREATE TABLE IF NOT EXISTS sale_item_batch_allocations (
  id                 BIGSERIAL PRIMARY KEY,
  org_id             BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sale_id            BIGINT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  sale_item_id       BIGINT NOT NULL REFERENCES sale_items(id) ON DELETE CASCADE,
  inventory_batch_id BIGINT NOT NULL REFERENCES inventory_batches(id) ON DELETE RESTRICT,
  quantity           INT NOT NULL CHECK (quantity > 0),
  unit_cost          NUMERIC(12,4) NOT NULL CHECK (unit_cost >= 0),
  created_by         BIGINT REFERENCES users(id) ON DELETE SET NULL,
  restored_at        TIMESTAMPTZ,
  restored_by        BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sale_item_id, inventory_batch_id)
);

CREATE INDEX IF NOT EXISTS idx_sale_item_batch_allocations_org
  ON sale_item_batch_allocations(org_id);

CREATE INDEX IF NOT EXISTS idx_sale_item_batch_allocations_sale
  ON sale_item_batch_allocations(sale_id);

CREATE INDEX IF NOT EXISTS idx_sale_item_batch_allocations_batch
  ON sale_item_batch_allocations(inventory_batch_id);

CREATE INDEX IF NOT EXISTS idx_sale_item_batch_allocations_active
  ON sale_item_batch_allocations(sale_id)
  WHERE restored_at IS NULL;
