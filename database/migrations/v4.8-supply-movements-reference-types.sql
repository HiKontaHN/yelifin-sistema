-- v4.8 — Permite SALE_CANCELLED y SALE_EDITED en supply_movements.reference_type
-- El código ya insertaba estos valores al cancelar/editar ventas con
-- suministros, pero el CHECK original solo permitía
-- ('SUPPLY_PURCHASE','SALE','ADJUSTMENT'), igual que inventory_movements
-- ya lo permite para sus propios movimientos.

ALTER TABLE supply_movements
  DROP CONSTRAINT supply_movements_reference_type_check;

ALTER TABLE supply_movements
  ADD CONSTRAINT supply_movements_reference_type_check
  CHECK (reference_type IN (
    'SUPPLY_PURCHASE',
    'SALE',
    'ADJUSTMENT',
    'SALE_CANCELLED',
    'SALE_EDITED'
  ));
