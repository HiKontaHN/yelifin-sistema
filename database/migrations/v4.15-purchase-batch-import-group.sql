-- ============================================================
-- MIGRACIÓN v4.15: AGRUPAR COMPRAS DE UNA MISMA IMPORTACIÓN EXCEL
-- Fecha: 2026-09-04
-- ============================================================
-- Cada fila de una importación por Excel crea su propio purchase_batch
-- independiente (uno por fila, ver app/api/inventory/import/route.ts).
-- Esta columna marca qué filas vinieron de la misma ejecución de
-- importación para poder verlas juntas como un solo lote en el
-- detalle de compra. NULL para compras creadas fuera del importador
-- (formulario manual de "Agregar stock" / "Nuevo producto").
-- ============================================================

ALTER TABLE purchase_batches
  ADD COLUMN IF NOT EXISTS import_batch_id UUID;

CREATE INDEX IF NOT EXISTS idx_purchase_batches_import_batch
  ON purchase_batches(import_batch_id);
