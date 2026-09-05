-- ============================================================
-- MIGRACIÓN v4.20: BODEGAS (STOCK SEPARADO POR BODEGA)
-- Fecha: 2026-09-05
-- ============================================================
-- Introduce bodegas como unidad real de stock: cada inventory_batch
-- pertenece a UNA bodega, y una venta descuenta solo de la bodega
-- asignada al usuario que la registra (organization_members.default_
-- warehouse_id), no de todas. Ver database/docs/warehouses-plan.md
-- para el alcance completo acordado con el usuario.
--
-- Backfill: toda org existente recibe una bodega "Local Principal"
-- (marcada is_default) y absorbe TODO su inventario/ventas/compras
-- actuales — nadie ve nada roto ni pierde stock.
--
-- Límite por plan (max_warehouses, mismo patrón que max_users v4.19):
--   trial=1, basico=1, pro=3 (una por cada uno de sus 3 usuarios
--   posibles), original/admin=NULL (sin límite).
-- ============================================================

-- ── 1. Tabla de bodegas ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS warehouses (
  id         BIGSERIAL PRIMARY KEY,
  org_id     BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name       VARCHAR(100) NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_warehouses_org ON warehouses(org_id);

-- Solo una bodega default por org.
CREATE UNIQUE INDEX IF NOT EXISTS idx_warehouses_one_default_per_org
  ON warehouses(org_id) WHERE is_default = TRUE;

-- ── 2. Backfill: una bodega "Local Principal" por org existente ─────
INSERT INTO warehouses (org_id, name, is_active, is_default)
SELECT o.id, 'Local Principal', TRUE, TRUE
FROM organizations o
WHERE NOT EXISTS (SELECT 1 FROM warehouses w WHERE w.org_id = o.id);

-- ── 3. warehouse_id en inventory_batches (NOT NULL — el stock siempre
--       vive en una bodega concreta) ─────────────────────────────────
ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS warehouse_id BIGINT REFERENCES warehouses(id) ON DELETE RESTRICT;

UPDATE inventory_batches ib
SET warehouse_id = w.id
FROM warehouses w
WHERE w.org_id = ib.org_id AND w.is_default = TRUE AND ib.warehouse_id IS NULL;

ALTER TABLE inventory_batches ALTER COLUMN warehouse_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_batches_warehouse ON inventory_batches(warehouse_id);

-- ── 4. warehouse_id en inventory_movements (nullable — es un log; no
--       hay forma de saber con certeza de qué bodega salió un movimiento
--       histórico anterior a esta migración, así que se aproxima a la
--       bodega default y queda nullable por si acaso) ────────────────
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS warehouse_id BIGINT REFERENCES warehouses(id) ON DELETE SET NULL;

UPDATE inventory_movements im
SET warehouse_id = w.id
FROM warehouses w
WHERE w.org_id = im.org_id AND w.is_default = TRUE AND im.warehouse_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_movements_warehouse ON inventory_movements(warehouse_id);

-- Permite TRANSFER_IN/TRANSFER_OUT como reference_type de movimiento
-- (transferencias entre bodegas, ver warehouse_transfers abajo).
ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_reference_type_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_reference_type_check
  CHECK (reference_type IN (
    'PURCHASE', 'SALE', 'ADJUSTMENT', 'INITIAL',
    'SALE_CANCELLED', 'SALE_EDITED',
    'TRANSFER_IN', 'TRANSFER_OUT'
  ));

-- ── 5. warehouse_id en sales (NOT NULL — de qué bodega se descontó) ──
ALTER TABLE sales ADD COLUMN IF NOT EXISTS warehouse_id BIGINT REFERENCES warehouses(id) ON DELETE RESTRICT;

UPDATE sales s
SET warehouse_id = w.id
FROM warehouses w
WHERE w.org_id = s.org_id AND w.is_default = TRUE AND s.warehouse_id IS NULL;

ALTER TABLE sales ALTER COLUMN warehouse_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_warehouse ON sales(warehouse_id);

-- ── 6. warehouse_id en purchase_batches (NOT NULL — a qué bodega llega
--       la mercancía comprada) ───────────────────────────────────────
ALTER TABLE purchase_batches ADD COLUMN IF NOT EXISTS warehouse_id BIGINT REFERENCES warehouses(id) ON DELETE RESTRICT;

UPDATE purchase_batches pb
SET warehouse_id = w.id
FROM warehouses w
WHERE w.org_id = pb.org_id AND w.is_default = TRUE AND pb.warehouse_id IS NULL;

ALTER TABLE purchase_batches ALTER COLUMN warehouse_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_batches_warehouse ON purchase_batches(warehouse_id);

-- ── 7. Bodega asignada a cada miembro (nullable — el dueño y las orgs
--       de una sola bodega no necesitan asignar nada) ────────────────
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS default_warehouse_id BIGINT REFERENCES warehouses(id) ON DELETE SET NULL;

-- ── 8. Límite de bodegas por plan ────────────────────────────────────
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS max_warehouses INT;

UPDATE subscription_plans SET max_warehouses = 1    WHERE slug = 'trial';
UPDATE subscription_plans SET max_warehouses = 1    WHERE slug = 'basico';
UPDATE subscription_plans SET max_warehouses = 3    WHERE slug = 'pro';
UPDATE subscription_plans SET max_warehouses = NULL WHERE slug = 'original';
UPDATE subscription_plans SET max_warehouses = NULL WHERE slug = 'admin';

-- ── 9. Transferencias entre bodegas ──────────────────────────────────
CREATE TABLE IF NOT EXISTS warehouse_transfers (
  id                BIGSERIAL PRIMARY KEY,
  org_id            BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  from_warehouse_id BIGINT NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  to_warehouse_id   BIGINT NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  notes             TEXT,
  created_by        BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (from_warehouse_id <> to_warehouse_id)
);

CREATE TABLE IF NOT EXISTS warehouse_transfer_items (
  id          BIGSERIAL PRIMARY KEY,
  org_id      BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  transfer_id BIGINT NOT NULL REFERENCES warehouse_transfers(id) ON DELETE CASCADE,
  product_id  BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id  BIGINT REFERENCES product_variants(id) ON DELETE RESTRICT,
  quantity    INT NOT NULL CHECK (quantity > 0),
  unit_cost   NUMERIC(12,4) NOT NULL CHECK (unit_cost >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_org      ON warehouse_transfers(org_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfer_items_org  ON warehouse_transfer_items(org_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfer_items_xfer ON warehouse_transfer_items(transfer_id);
