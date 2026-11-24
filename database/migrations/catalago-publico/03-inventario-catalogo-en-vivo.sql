-- Ejecutar después de 01-catalogo-publico.sql y 02-redes-sociales.sql.
BEGIN;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS catalog_item_id UUID NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS catalog_item_id UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_catalog_item_id ON products(catalog_item_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_variants_catalog_item_id ON product_variants(catalog_item_id);

-- Solo se avisa que cambió la organización. El servidor vuelve a leer el
-- catálogo publicado una vez confirmada la transacción.
CREATE OR REPLACE FUNCTION notify_catalog_inventory_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_org BIGINT;
  previous_org BIGINT;
BEGIN
  IF TG_TABLE_NAME = 'organizations' THEN
    current_org := NEW.id;
  ELSE
    IF TG_OP <> 'DELETE' THEN current_org := NEW.org_id; END IF;
    IF TG_OP <> 'INSERT' THEN previous_org := OLD.org_id; END IF;
  END IF;

  IF current_org IS NOT NULL THEN
    PERFORM pg_notify('hikonta_catalog_changed', current_org::text);
  END IF;
  IF previous_org IS NOT NULL AND previous_org IS DISTINCT FROM current_org THEN
    PERFORM pg_notify('hikonta_catalog_changed', previous_org::text);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS catalog_inventory_changed ON inventory_batches;
CREATE TRIGGER catalog_inventory_changed
  AFTER INSERT OR UPDATE OF qty_available, org_id, product_id, variant_id OR DELETE ON inventory_batches
  FOR EACH ROW EXECUTE FUNCTION notify_catalog_inventory_change();

DROP TRIGGER IF EXISTS catalog_selection_changed ON organization_catalog_items;
CREATE TRIGGER catalog_selection_changed
  AFTER INSERT OR DELETE ON organization_catalog_items
  FOR EACH ROW EXECUTE FUNCTION notify_catalog_inventory_change();

DROP TRIGGER IF EXISTS catalog_product_changed ON products;
CREATE TRIGGER catalog_product_changed
  AFTER UPDATE OF is_active, is_service ON products
  FOR EACH ROW WHEN (OLD.is_active IS DISTINCT FROM NEW.is_active OR OLD.is_service IS DISTINCT FROM NEW.is_service)
  EXECUTE FUNCTION notify_catalog_inventory_change();

DROP TRIGGER IF EXISTS catalog_variant_changed ON product_variants;
CREATE TRIGGER catalog_variant_changed
  AFTER INSERT OR UPDATE OF is_active OR DELETE ON product_variants
  FOR EACH ROW EXECUTE FUNCTION notify_catalog_inventory_change();

DROP TRIGGER IF EXISTS catalog_warehouse_changed ON warehouses;
CREATE TRIGGER catalog_warehouse_changed
  AFTER UPDATE OF is_active ON warehouses
  FOR EACH ROW WHEN (OLD.is_active IS DISTINCT FROM NEW.is_active)
  EXECUTE FUNCTION notify_catalog_inventory_change();

DROP TRIGGER IF EXISTS catalog_link_changed ON organizations;
CREATE TRIGGER catalog_link_changed
  AFTER UPDATE OF catalog_public_id, is_active ON organizations
  FOR EACH ROW WHEN (OLD.catalog_public_id IS DISTINCT FROM NEW.catalog_public_id OR OLD.is_active IS DISTINCT FROM NEW.is_active)
  EXECUTE FUNCTION notify_catalog_inventory_change();

COMMIT;
