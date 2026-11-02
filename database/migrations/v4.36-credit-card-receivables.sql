-- v4.36: permite originar cuentas por cobrar desde cargos de tarjeta de crédito.

ALTER TABLE accounts_receivable
  DROP CONSTRAINT IF EXISTS accounts_receivable_source_type_check;

ALTER TABLE accounts_receivable
  ADD CONSTRAINT accounts_receivable_source_type_check CHECK (source_type IN (
    'CREDIT_SALE', 'INSTALLMENT_SALE', 'PERSONAL_LOAN',
    'CREDIT_CARD_TRANSACTION', 'OTHER'
  ));
