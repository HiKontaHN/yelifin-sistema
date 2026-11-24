-- ============================================================
-- CATÁLOGO PÚBLICO 01: ENLACE PÚBLICO POR ORGANIZACIÓN
-- Fecha: 2026-11-24
-- ============================================================
-- El UUID se crea únicamente cuando el dueño genera su catálogo.
-- Al regenerarlo, el enlace anterior deja de resolver inmediatamente.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS catalog_public_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_catalog_public_id
  ON organizations(catalog_public_id)
  WHERE catalog_public_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS organization_catalog_items (
  org_id     BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (org_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_organization_catalog_items_product
  ON organization_catalog_items(product_id);
