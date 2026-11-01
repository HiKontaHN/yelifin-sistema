-- v4.34: configuración de abonos automáticos para cuentas por pagar.

ALTER TABLE accounts_payable
  ADD COLUMN IF NOT EXISTS auto_payment_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_payment_account_id BIGINT REFERENCES accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS auto_payment_next_date DATE;

CREATE INDEX IF NOT EXISTS idx_payables_auto_payment
  ON accounts_payable(auto_payment_enabled, auto_payment_next_date)
  WHERE auto_payment_enabled = TRUE;
