-- v4.33: pagos a capital y cancelación lógica de cuentas por pagar.

ALTER TABLE accounts_payable
  ADD COLUMN IF NOT EXISTS principal_outstanding NUMERIC(14,2);

UPDATE accounts_payable ap
SET principal_outstanding = GREATEST(
  0,
  ap.original_amount - COALESCE((
    SELECT SUM(app.amount)
    FROM accounts_payable_payments app
    WHERE app.payable_id = ap.id
  ), 0)
)
WHERE ap.principal_outstanding IS NULL;

ALTER TABLE accounts_payable
  ALTER COLUMN principal_outstanding SET DEFAULT 0,
  ALTER COLUMN principal_outstanding SET NOT NULL;

ALTER TABLE accounts_payable_payments
  ADD COLUMN IF NOT EXISTS payment_type VARCHAR(20) NOT NULL DEFAULT 'INSTALLMENT';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'accounts_payable_payment_type_check'
  ) THEN
    ALTER TABLE accounts_payable_payments
      ADD CONSTRAINT accounts_payable_payment_type_check
      CHECK (payment_type IN ('INSTALLMENT', 'CAPITAL'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payable_payments_type
  ON accounts_payable_payments(payable_id, payment_type);
