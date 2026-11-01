-- v4.35: los abonos automáticos se configuran por día del mes.

ALTER TABLE accounts_payable
  ADD COLUMN IF NOT EXISTS auto_payment_day SMALLINT;

UPDATE accounts_payable
SET auto_payment_day = EXTRACT(DAY FROM auto_payment_next_date)::smallint
WHERE auto_payment_day IS NULL
  AND auto_payment_next_date IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'accounts_payable_auto_payment_day_check'
  ) THEN
    ALTER TABLE accounts_payable
      ADD CONSTRAINT accounts_payable_auto_payment_day_check
      CHECK (auto_payment_day IS NULL OR auto_payment_day BETWEEN 1 AND 31);
  END IF;
END $$;
