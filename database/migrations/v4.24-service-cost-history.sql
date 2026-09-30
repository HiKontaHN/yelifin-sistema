-- ============================================================
-- MIGRACIÓN v4.24: HISTORIAL DE COSTO DE SERVICIO
-- Fecha: 2026-09-29
-- ============================================================
-- Los servicios no generan lotes de inventario (inventory_batches), que es
-- de donde los productos físicos sacan su gráfica de "evolución del precio
-- de entrada" (GET /api/products/[id]/detail → cost_history). Para poder
-- mostrar lo mismo en un servicio, se registra cada valor de
-- products.service_cost que estuvo vigente, con la fecha en que se fijó.
--
-- Puramente informativo: no genera transacción ni afecta cuentas.
-- ============================================================

CREATE TABLE IF NOT EXISTS service_cost_history (
  id         BIGSERIAL PRIMARY KEY,
  org_id     BIGINT NOT NULL REFERENCES organizations(id),
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  cost       NUMERIC(12,2) NOT NULL CHECK (cost >= 0),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by BIGINT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_service_cost_history_product
  ON service_cost_history(org_id, product_id, changed_at);
