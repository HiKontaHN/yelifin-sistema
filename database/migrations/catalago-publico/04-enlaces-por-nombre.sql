BEGIN;

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS catalog_public_slug TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_catalog_public_slug
  ON organizations (catalog_public_slug)
  WHERE catalog_public_slug IS NOT NULL;

-- Reservar los enlaces antiguos impide que un enlace revocado apunte a otro negocio.
CREATE TABLE IF NOT EXISTS catalog_reserved_slugs (
  slug TEXT PRIMARY KEY
);

CREATE OR REPLACE FUNCTION assign_catalog_public_slug() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  suffix INTEGER := 1;
BEGIN
  IF NEW.catalog_public_id IS NULL THEN
    NEW.catalog_public_slug := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.catalog_public_id = OLD.catalog_public_id
    AND OLD.catalog_public_slug IS NOT NULL THEN
    RETURN NEW;
  END IF;

  base_slug := trim(BOTH '-' FROM left(regexp_replace(
    lower(regexp_replace(normalize(NEW.name, NFD), U&'[\0300-\036F]', '', 'g')),
    '[^a-z0-9]+', '-', 'g'
  ), 100));
  IF base_slug = '' THEN
    base_slug := 'negocio';
  ELSIF base_slug ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' THEN
    base_slug := 'negocio-' || base_slug;
  END IF;

  candidate := base_slug;
  LOOP
    INSERT INTO catalog_reserved_slugs (slug) VALUES (candidate)
    ON CONFLICT DO NOTHING;
    IF FOUND THEN
      NEW.catalog_public_slug := candidate;
      RETURN NEW;
    END IF;
    suffix := suffix + 1;
    candidate := base_slug || '-' || suffix;
  END LOOP;
END;
$$;

DROP TRIGGER IF EXISTS assign_catalog_public_slug ON organizations;
CREATE TRIGGER assign_catalog_public_slug
  BEFORE INSERT OR UPDATE OF catalog_public_id ON organizations
  FOR EACH ROW EXECUTE FUNCTION assign_catalog_public_slug();

UPDATE organizations
SET catalog_public_id = catalog_public_id
WHERE catalog_public_id IS NOT NULL AND catalog_public_slug IS NULL;

COMMIT;
