-- v4.31: personas, roles y contactos
-- Una persona puede tener varios roles y puede estar vinculada a entidades.
-- Se conservan customers y financial_entities para compatibilidad con el sistema actual.

CREATE TABLE IF NOT EXISTS people (
  id BIGSERIAL PRIMARY KEY,
  org_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  tax_id VARCHAR(50),
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  source_customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  source_entity_id BIGINT REFERENCES financial_entities(id) ON DELETE SET NULL,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_people_org_active
  ON people(org_id, is_active, name);

CREATE UNIQUE INDEX IF NOT EXISTS uq_people_source_customer
  ON people(source_customer_id)
  WHERE source_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_people_source_entity
  ON people(source_entity_id)
  WHERE source_entity_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS person_roles (
  person_id BIGINT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('CLIENT', 'SUPPLIER', 'THIRD_PARTY', 'CONTACT')),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (person_id, role)
);

CREATE INDEX IF NOT EXISTS idx_person_roles_role
  ON person_roles(role, person_id);

CREATE TABLE IF NOT EXISTS entity_contacts (
  entity_id BIGINT NOT NULL REFERENCES financial_entities(id) ON DELETE CASCADE,
  person_id BIGINT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  relationship VARCHAR(80),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (entity_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_contacts_person
  ON entity_contacts(person_id);

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS person_id BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_person_id_fkey'
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT customers_person_id_fkey
      FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_person_id
  ON customers(person_id)
  WHERE person_id IS NOT NULL;

-- Migra los clientes existentes a Personas conservando su ID original.
INSERT INTO people (
  org_id, name, email, phone, notes, source_customer_id, created_by, created_at
)
SELECT c.org_id, c.name, c.email, c.phone, c.notes, c.id, c.created_by, c.created_at
FROM customers c
WHERE NOT EXISTS (
  SELECT 1 FROM people p WHERE p.source_customer_id = c.id
);

UPDATE customers c
SET person_id = p.id
FROM people p
WHERE p.source_customer_id = c.id
  AND c.person_id IS NULL;

INSERT INTO person_roles (person_id, role, is_primary)
SELECT p.id, 'CLIENT', TRUE
FROM people p
WHERE p.source_customer_id IS NOT NULL
ON CONFLICT (person_id, role) DO NOTHING;

-- Convierte el contacto principal existente de cada entidad en una Persona.
INSERT INTO people (
  org_id, name, email, phone, source_entity_id, created_by, created_at
)
SELECT e.org_id, e.contact_name, e.email, e.phone, e.id, e.created_by, e.created_at
FROM financial_entities e
WHERE NULLIF(BTRIM(e.contact_name), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM people p WHERE p.source_entity_id = e.id
  );

INSERT INTO person_roles (person_id, role, is_primary)
SELECT p.id, 'CONTACT', TRUE
FROM people p
WHERE p.source_entity_id IS NOT NULL
ON CONFLICT (person_id, role) DO NOTHING;

INSERT INTO entity_contacts (entity_id, person_id, relationship, is_primary)
SELECT p.source_entity_id, p.id, 'Contacto principal', TRUE
FROM people p
WHERE p.source_entity_id IS NOT NULL
ON CONFLICT (entity_id, person_id) DO NOTHING;
