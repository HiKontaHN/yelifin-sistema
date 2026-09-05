-- ============================================================
-- MIGRACIÓN v4.18: SNAPSHOTS DIARIOS DE INVENTARIO
-- Fecha: 2026-09-05
-- ============================================================
-- Guarda una foto diaria (por org) del valor y unidades totales en
-- inventario. Sin este historial no se puede calcular rotación de
-- inventario ni días de inventario en el reporte de inventario — esas
-- métricas necesitan un promedio en el tiempo, no solo el stock de hoy,
-- y no son reconstruibles retroactivamente desde inventory_movements
-- porque esa tabla no guarda el costo unitario de cada movimiento.
--
-- Poblada por un cron diario (ver app/api/cron/inventory-snapshot/route.ts
-- y vercel.json) — solo para orgs en un plan de pago elegible, no para
-- todas. UNIQUE(org_id, snapshot_date) hace el INSERT idempotente si el
-- cron corre más de una vez el mismo día.
-- ============================================================

CREATE TABLE IF NOT EXISTS inventory_snapshots (
  id                BIGSERIAL PRIMARY KEY,
  org_id            BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  snapshot_date     DATE NOT NULL,
  total_stock       INT NOT NULL DEFAULT 0,
  total_stock_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_inventory_snapshots_org_date ON inventory_snapshots(org_id, snapshot_date DESC);
