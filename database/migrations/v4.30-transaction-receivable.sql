-- v4.30: vincula egresos manuales con cuentas por cobrar

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_reference_type_check;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_reference_type_check CHECK (reference_type IN (
    'SALE', 'PURCHASE', 'SUPPLY_PURCHASE', 'EVENT', 'OTHER',
    'CREDIT_CARD_PAYMENT', 'PURCHASE_SHIPPING',
    'RECEIVABLE', 'RECEIVABLE_PAYMENT', 'PAYABLE_PAYMENT'
  ));
