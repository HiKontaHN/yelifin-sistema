-- v4.32: las cuentas por cobrar pueden pertenecer a cualquier Persona.
-- customer_id se conserva para compatibilidad con cuentas existentes.

ALTER TABLE accounts_receivable
  ADD COLUMN IF NOT EXISTS person_id BIGINT REFERENCES people(id) ON DELETE RESTRICT;

ALTER TABLE accounts_receivable
  ALTER COLUMN customer_id DROP NOT NULL;

UPDATE accounts_receivable ar
SET person_id = p.id
FROM people p
WHERE ar.person_id IS NULL
  AND p.source_customer_id = ar.customer_id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'accounts_receivable_owner_check'
  ) THEN
    ALTER TABLE accounts_receivable
      ADD CONSTRAINT accounts_receivable_owner_check
      CHECK (customer_id IS NOT NULL OR person_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_accounts_receivable_person
  ON accounts_receivable(org_id, person_id);
