-- ================================================================
-- FIX TIME ZONE / 01
-- Fechas contables explícitas y compatibilidad durante el despliegue.
--
-- IMPORTANTE:
--   No se cambia el tipo ni se reinterpreta ningún timestamp histórico.
--   Las columnas DATE representan un día de negocio, no un instante UTC.
-- ================================================================

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS effective_date DATE;

ALTER TABLE credit_card_transactions
  ADD COLUMN IF NOT EXISTS effective_date DATE;

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS sale_date DATE;

ALTER TABLE purchase_batches
  ADD COLUMN IF NOT EXISTS purchase_date DATE;

ALTER TABLE supply_purchases
  ADD COLUMN IF NOT EXISTS purchase_date DATE;

ALTER TABLE inventory_batches
  ADD COLUMN IF NOT EXISTS received_date DATE;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE;

-- Permite desplegar la base antes o después del código. Mientras existan
-- escritores antiguos, deriva DATE desde el timestamp legacy. Si un escritor
-- nuevo manda DATE explícitamente, ese valor siempre tiene prioridad.
CREATE OR REPLACE FUNCTION sync_legacy_business_date()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  date_column TEXT := TG_ARGV[0];
  timestamp_column TEXT := TG_ARGV[1];
  new_date DATE;
  old_date DATE;
  legacy_date DATE;
BEGIN
  new_date := NULLIF(to_jsonb(NEW) ->> date_column, '')::DATE;
  legacy_date := NULLIF(to_jsonb(NEW) ->> timestamp_column, '')::TIMESTAMP::DATE;

  IF TG_OP = 'INSERT' THEN
    IF new_date IS NULL AND legacy_date IS NOT NULL THEN
      NEW := jsonb_populate_record(NEW, jsonb_build_object(date_column, legacy_date));
    END IF;
    RETURN NEW;
  END IF;

  old_date := NULLIF(to_jsonb(OLD) ->> date_column, '')::DATE;

  -- Si DATE no fue modificado explícitamente pero sí cambió el timestamp
  -- legacy, se mantiene la compatibilidad con clientes anteriores.
  IF new_date IS NOT DISTINCT FROM old_date
     AND (to_jsonb(NEW) ->> timestamp_column)
         IS DISTINCT FROM (to_jsonb(OLD) ->> timestamp_column) THEN
    NEW := jsonb_populate_record(NEW, jsonb_build_object(date_column, legacy_date));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_transactions_business_date ON transactions;
CREATE TRIGGER trg_transactions_business_date
BEFORE INSERT OR UPDATE ON transactions
FOR EACH ROW EXECUTE FUNCTION sync_legacy_business_date('effective_date', 'occurred_at');

DROP TRIGGER IF EXISTS trg_credit_card_transactions_business_date ON credit_card_transactions;
CREATE TRIGGER trg_credit_card_transactions_business_date
BEFORE INSERT OR UPDATE ON credit_card_transactions
FOR EACH ROW EXECUTE FUNCTION sync_legacy_business_date('effective_date', 'occurred_at');

DROP TRIGGER IF EXISTS trg_sales_business_date ON sales;
CREATE TRIGGER trg_sales_business_date
BEFORE INSERT OR UPDATE ON sales
FOR EACH ROW EXECUTE FUNCTION sync_legacy_business_date('sale_date', 'sold_at');

DROP TRIGGER IF EXISTS trg_purchase_batches_business_date ON purchase_batches;
CREATE TRIGGER trg_purchase_batches_business_date
BEFORE INSERT OR UPDATE ON purchase_batches
FOR EACH ROW EXECUTE FUNCTION sync_legacy_business_date('purchase_date', 'purchased_at');

DROP TRIGGER IF EXISTS trg_supply_purchases_business_date ON supply_purchases;
CREATE TRIGGER trg_supply_purchases_business_date
BEFORE INSERT OR UPDATE ON supply_purchases
FOR EACH ROW EXECUTE FUNCTION sync_legacy_business_date('purchase_date', 'purchased_at');

DROP TRIGGER IF EXISTS trg_inventory_batches_business_date ON inventory_batches;
CREATE TRIGGER trg_inventory_batches_business_date
BEFORE INSERT OR UPDATE ON inventory_batches
FOR EACH ROW EXECUTE FUNCTION sync_legacy_business_date('received_date', 'received_at');

DROP TRIGGER IF EXISTS trg_events_start_business_date ON events;
CREATE TRIGGER trg_events_start_business_date
BEFORE INSERT OR UPDATE ON events
FOR EACH ROW EXECUTE FUNCTION sync_legacy_business_date('start_date', 'starts_at');

DROP TRIGGER IF EXISTS trg_events_end_business_date ON events;
CREATE TRIGGER trg_events_end_business_date
BEFORE INSERT OR UPDATE ON events
FOR EACH ROW EXECUTE FUNCTION sync_legacy_business_date('end_date', 'ends_at');

