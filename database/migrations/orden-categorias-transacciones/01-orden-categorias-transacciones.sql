-- v4.38: orden personalizado para las categorías de transacciones.
-- Las categorías sin posición conservan su orden alfabético.
ALTER TABLE transaction_categories
  ADD COLUMN IF NOT EXISTS display_order INTEGER CHECK (display_order > 0);
