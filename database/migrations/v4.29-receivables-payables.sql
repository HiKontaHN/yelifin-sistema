-- v4.29: cuentas por cobrar y por pagar
-- MVP operativo; la capa de partidas contables se puede agregar después.

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_reference_type_check;
ALTER TABLE transactions
  ADD CONSTRAINT transactions_reference_type_check CHECK (reference_type IN (
    'SALE', 'PURCHASE', 'SUPPLY_PURCHASE', 'EVENT', 'OTHER',
    'CREDIT_CARD_PAYMENT', 'PURCHASE_SHIPPING',
    'RECEIVABLE_PAYMENT', 'PAYABLE_PAYMENT'
  ));

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'PAID';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_payment_status_check'
  ) THEN
    ALTER TABLE sales ADD CONSTRAINT sales_payment_status_check
      CHECK (payment_status IN ('PENDING', 'PARTIAL', 'PAID'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS financial_entities (
  id BIGSERIAL PRIMARY KEY,
  org_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  entity_type VARCHAR(30) NOT NULL CHECK (entity_type IN (
    'SUPPLIER', 'BANK', 'FINANCIAL_INSTITUTION', 'PERSON', 'OTHER'
  )),
  tax_id VARCHAR(50),
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_financial_entities_org
  ON financial_entities(org_id, entity_type, is_active);

ALTER TABLE financial_entities
  ADD COLUMN IF NOT EXISTS contact_name VARCHAR(150);

CREATE TABLE IF NOT EXISTS accounts_receivable (
  id BIGSERIAL PRIMARY KEY,
  org_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  source_type VARCHAR(30) NOT NULL DEFAULT 'OTHER' CHECK (source_type IN (
    'CREDIT_SALE', 'INSTALLMENT_SALE', 'PERSONAL_LOAN', 'OTHER'
  )),
  source_id BIGINT,
  description VARCHAR(255) NOT NULL,
  original_amount NUMERIC(14,2) NOT NULL CHECK (original_amount > 0),
  outstanding_amount NUMERIC(14,2) NOT NULL CHECK (outstanding_amount >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'HNL',
  interest_rate NUMERIC(8,4),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED'
  )),
  notes TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_accounts_receivable_org_status
  ON accounts_receivable(org_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_accounts_receivable_customer
  ON accounts_receivable(org_id, customer_id);

CREATE TABLE IF NOT EXISTS accounts_receivable_installments (
  id BIGSERIAL PRIMARY KEY,
  receivable_id BIGINT NOT NULL REFERENCES accounts_receivable(id) ON DELETE CASCADE,
  installment_number INT NOT NULL CHECK (installment_number > 0),
  due_date DATE NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING', 'PARTIAL', 'PAID', 'OVERDUE'
  )),
  UNIQUE (receivable_id, installment_number)
);

CREATE TABLE IF NOT EXISTS accounts_receivable_payments (
  id BIGSERIAL PRIMARY KEY,
  receivable_id BIGINT NOT NULL REFERENCES accounts_receivable(id) ON DELETE CASCADE,
  installment_id BIGINT REFERENCES accounts_receivable_installments(id) ON DELETE SET NULL,
  account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  transaction_id BIGINT UNIQUE REFERENCES transactions(id) ON DELETE SET NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payment_method VARCHAR(30),
  notes TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_receivable_payments_receivable
  ON accounts_receivable_payments(receivable_id, paid_at);

CREATE TABLE IF NOT EXISTS accounts_payable (
  id BIGSERIAL PRIMARY KEY,
  org_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_id BIGINT NOT NULL REFERENCES financial_entities(id) ON DELETE RESTRICT,
  account_type VARCHAR(30) NOT NULL DEFAULT 'OTHER' CHECK (account_type IN (
    'SUPPLIER_CREDIT', 'BANK_LOAN', 'CREDIT_CARD', 'PERSONAL_LOAN', 'OTHER'
  )),
  description VARCHAR(255) NOT NULL,
  original_amount NUMERIC(14,2) NOT NULL CHECK (original_amount > 0),
  outstanding_amount NUMERIC(14,2) NOT NULL CHECK (outstanding_amount >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'HNL',
  interest_rate NUMERIC(8,4),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED'
  )),
  notes TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_accounts_payable_org_status
  ON accounts_payable(org_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_accounts_payable_entity
  ON accounts_payable(org_id, entity_id);

ALTER TABLE accounts_payable
  ADD COLUMN IF NOT EXISTS payment_frequency VARCHAR(20) NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN IF NOT EXISTS term_unit VARCHAR(10) NOT NULL DEFAULT 'MONTHS',
  ADD COLUMN IF NOT EXISTS term_count INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS interest_period VARCHAR(10) NOT NULL DEFAULT 'ANNUAL',
  ADD COLUMN IF NOT EXISTS total_interest NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_payable NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS installment_count INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS installment_amount NUMERIC(14,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS accounts_payable_installments (
  id BIGSERIAL PRIMARY KEY,
  payable_id BIGINT NOT NULL REFERENCES accounts_payable(id) ON DELETE CASCADE,
  installment_number INT NOT NULL CHECK (installment_number > 0),
  due_date DATE NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING', 'PARTIAL', 'PAID', 'OVERDUE'
  )),
  UNIQUE (payable_id, installment_number)
);

CREATE TABLE IF NOT EXISTS accounts_payable_payments (
  id BIGSERIAL PRIMARY KEY,
  payable_id BIGINT NOT NULL REFERENCES accounts_payable(id) ON DELETE CASCADE,
  installment_id BIGINT REFERENCES accounts_payable_installments(id) ON DELETE SET NULL,
  account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  transaction_id BIGINT UNIQUE REFERENCES transactions(id) ON DELETE SET NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payment_method VARCHAR(30),
  notes TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payable_payments_payable
  ON accounts_payable_payments(payable_id, paid_at);

INSERT INTO system_features (feature_key, feature_name, category)
VALUES ('finances.receivables_payables', 'Cuentas por cobrar y pagar', 'FINANCES')
ON CONFLICT (feature_key) DO NOTHING;

INSERT INTO plan_features (plan_id, feature_id, is_enabled)
SELECT p.id, f.id, TRUE
FROM subscription_plans p
JOIN system_features f ON f.feature_key = 'finances.receivables_payables'
-- Original y las cuentas internas del plan admin pueden usar cuentas por cobrar/pagar.
WHERE p.slug IN ('original', 'admin')
ON CONFLICT (plan_id, feature_id) DO UPDATE SET is_enabled = TRUE;

-- Sincroniza ventas existentes con cuentas por cobrar ya creadas.
UPDATE sales s
SET payment_status = CASE
  WHEN ar.id IS NULL THEN CASE WHEN s.status = 'PENDING' THEN 'PENDING' ELSE 'PAID' END
  WHEN ar.outstanding_amount <= 0 THEN 'PAID'
  WHEN ar.outstanding_amount < ar.original_amount THEN 'PARTIAL'
  ELSE 'PENDING'
END
FROM accounts_receivable ar
WHERE ar.source_type = 'CREDIT_SALE'
  AND ar.source_id = s.id;

-- Esta feature es experimental: Pro todavía no la recibe.
UPDATE plan_features pf
SET is_enabled = FALSE
FROM subscription_plans p, system_features f
WHERE pf.plan_id = p.id
  AND pf.feature_id = f.id
  AND p.slug = 'pro'
  AND f.feature_key = 'finances.receivables_payables';
