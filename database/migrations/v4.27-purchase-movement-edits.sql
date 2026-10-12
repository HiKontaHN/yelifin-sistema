-- ============================================================
-- MIGRACIÓN v4.27: CORRECCIONES DE INGRESOS DE INVENTARIO
-- Fecha: 2026-10-12
-- ============================================================
-- Los movimientos son un libro inmutable. Al editar una compra completada
-- se registra únicamente el delta con PURCHASE_EDITED y se conserva el
-- movimiento PURCHASE original para auditoría.
-- ============================================================

ALTER TABLE inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_reference_type_check;

ALTER TABLE inventory_movements
  ADD CONSTRAINT inventory_movements_reference_type_check
  CHECK (reference_type IN (
    'PURCHASE', 'PURCHASE_EDITED', 'SALE', 'ADJUSTMENT', 'INITIAL',
    'SALE_CANCELLED', 'SALE_EDITED', 'TRANSFER_IN', 'TRANSFER_OUT'
  ));

