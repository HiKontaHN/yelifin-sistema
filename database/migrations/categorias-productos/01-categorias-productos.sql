BEGIN;

CREATE TABLE IF NOT EXISTS product_categories (
  id BIGSERIAL PRIMARY KEY,
  org_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  UNIQUE (org_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_categories_org_name
  ON product_categories (org_id, lower(name));

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS product_category_id BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_category_org_fk' AND conrelid = 'products'::regclass
  ) THEN
    ALTER TABLE products ADD CONSTRAINT products_category_org_fk
      FOREIGN KEY (org_id, product_category_id) REFERENCES product_categories (org_id, id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_org_category
  ON products (org_id, product_category_id)
  WHERE product_category_id IS NOT NULL;

COMMIT;
