-- ============================================================
-- MIGRACIÓN v4.11: SOFT-DELETE AL CANCELAR UNA VENTA
-- ============================================================
-- Cancelar una venta (PENDING o COMPLETED) hoy borra físicamente
-- sales/sale_items/sale_supplies y, si estaba COMPLETED, también la
-- transacción de ingreso vinculada. Esto pierde toda trazabilidad
-- (quién canceló, cuándo, por qué).
--
-- Esta migración agrega deleted_at (+ quién/por qué en sales) para que
-- cancelar marque en vez de borrar. sales.status ya admite 'CANCELLED'
-- desde una migración anterior (ver ddl.v3.sql) — se reutiliza ese valor.
--
-- SEGURO DE EJECUTAR EN PRODUCCIÓN:
--   - Solo agrega columnas nuevas, todas nullable, todas IF NOT EXISTS.
--   - No borra ni modifica ninguna fila existente.
-- ============================================================

-- sales: quién canceló, cuándo y por qué (opcional)
ALTER TABLE sales ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS deleted_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- líneas de la venta: solo necesitan saber que quedaron fuera
ALTER TABLE sale_items    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE sale_supplies ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- transacción de ingreso vinculada a la venta
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS deleted_by BIGINT REFERENCES users(id) ON DELETE SET NULL;

-- índices para las listas/agregados que siguen excluyendo canceladas
CREATE INDEX IF NOT EXISTS idx_sales_deleted_at        ON sales(org_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_transactions_deleted_at ON transactions(org_id, deleted_at);
