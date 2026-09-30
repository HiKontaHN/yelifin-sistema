-- ============================================================
-- MIGRACIÓN v4.23: COSTO DE SERVICIO
-- Fecha: 2026-09-29
-- ============================================================
-- Los productos tipo servicio (is_service = TRUE) no tienen inventario,
-- así que nunca tuvieron una forma de registrar cuánto le cuesta al negocio
-- prestar el servicio (mano de obra, materiales, etc.) — sale_items.unit_cost
-- quedaba fijo en 0 y la ganancia de esas líneas salía inflada.
--
-- service_cost guarda ese costo directamente en el producto (no hay lotes
-- FIFO que lo carguen). Es puramente informativo para el cálculo de
-- ganancia: no genera transacción, no afecta cuentas ni balances.
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS service_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (service_cost >= 0);
