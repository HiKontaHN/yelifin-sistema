-- ================================================================
-- FIX TIME ZONE / 02
-- Backfill conservador.
--
-- Los timestamps legacy contienen una mezcla histórica de UTC y hora local.
-- Por eso NO se convierten con AT TIME ZONE. `timestamp::date` conserva el
-- día calendario que la aplicación mostraba antes de esta corrección.
-- ================================================================

UPDATE transactions
SET effective_date = occurred_at::DATE
WHERE effective_date IS NULL;

UPDATE credit_card_transactions
SET effective_date = occurred_at::DATE
WHERE effective_date IS NULL;

UPDATE sales
SET sale_date = sold_at::DATE
WHERE sale_date IS NULL;

UPDATE purchase_batches
SET purchase_date = purchased_at::DATE
WHERE purchase_date IS NULL;

UPDATE supply_purchases
SET purchase_date = purchased_at::DATE
WHERE purchase_date IS NULL;

UPDATE inventory_batches
SET received_date = received_at::DATE
WHERE received_date IS NULL;

UPDATE events
SET start_date = starts_at::DATE
WHERE start_date IS NULL AND starts_at IS NOT NULL;

UPDATE events
SET end_date = ends_at::DATE
WHERE end_date IS NULL AND ends_at IS NOT NULL;

ALTER TABLE transactions
  ALTER COLUMN effective_date SET NOT NULL;

ALTER TABLE credit_card_transactions
  ALTER COLUMN effective_date SET NOT NULL;

ALTER TABLE sales
  ALTER COLUMN sale_date SET NOT NULL;

ALTER TABLE purchase_batches
  ALTER COLUMN purchase_date SET NOT NULL;

ALTER TABLE supply_purchases
  ALTER COLUMN purchase_date SET NOT NULL;

ALTER TABLE inventory_batches
  ALTER COLUMN received_date SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_org_effective_date
  ON transactions (org_id, effective_date, id);

CREATE INDEX IF NOT EXISTS idx_cc_transactions_org_effective_date
  ON credit_card_transactions (org_id, effective_date, id);

CREATE INDEX IF NOT EXISTS idx_sales_org_sale_date
  ON sales (org_id, sale_date, id);

CREATE INDEX IF NOT EXISTS idx_purchase_batches_org_purchase_date
  ON purchase_batches (org_id, purchase_date, id);

CREATE INDEX IF NOT EXISTS idx_supply_purchases_org_purchase_date
  ON supply_purchases (org_id, purchase_date, id);

CREATE INDEX IF NOT EXISTS idx_inventory_batches_org_received_date
  ON inventory_batches (org_id, received_date, id);

CREATE INDEX IF NOT EXISTS idx_events_org_date_range
  ON events (org_id, start_date, end_date, id);

