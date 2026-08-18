-- ============================================================
-- MIGRACIÓN v4.10: TABLA DE INDUSTRIAS
-- ============================================================
-- Reemplaza el CHECK constraint (enum fijo) de organizations.industry por
-- una tabla real — permite agregar/desactivar industrias sin migración,
-- y es la fuente de verdad que consume /api/industries.
--
-- SEGURO DE EJECUTAR EN PRODUCCIÓN:
--   - Tabla nueva con IF NOT EXISTS, seed idempotente (ON CONFLICT).
--   - organizations.industry_id se agrega nullable y se backfillea desde
--     el valor viejo antes de tocar nada — no se pierde el dato de
--     ninguna org que ya lo tuviera seteado.
-- PRERREQUISITO: v4.9-add-org-industry.sql ya ejecutado.
-- ============================================================

-- PASO 1: tabla industries

CREATE TABLE IF NOT EXISTS industries (
  id         BIGSERIAL    PRIMARY KEY,
  slug       VARCHAR(40)  UNIQUE NOT NULL,
  name       VARCHAR(100) NOT NULL,
  sort_order INT          NOT NULL DEFAULT 0,
  is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_industries_active ON industries(is_active, sort_order);

-- PASO 2: seed — mismas 15 de v4.9 (slugs en minúscula) + "Trinkets y
-- productos cute" (stickers, llaveros, plushies, papelería kawaii, etc. —
-- el rubro de Jelly Finds, una de las orgs reales del seed de partners).

INSERT INTO industries (slug, name, sort_order) VALUES
  ('tecnologia',                'Tecnología',                      10),
  ('salud',                     'Salud y medicina',                20),
  ('alimentos_bebidas',         'Alimentos y bebidas',             30),
  ('moda_accesorios',           'Moda y accesorios',               40),
  ('belleza_cuidado_personal',  'Belleza y cuidado personal',      50),
  ('trinkets_productos_cute',   'Trinkets y productos cute',       55),
  ('hogar_decoracion',          'Hogar y decoración',              60),
  ('educacion',                 'Educación',                       70),
  ('servicios_profesionales',   'Servicios profesionales',         80),
  ('comercio_retail',           'Comercio / Retail',               90),
  ('manufactura_artesanias',    'Manufactura y artesanías',       100),
  ('automotriz',                'Automotriz',                     110),
  ('construccion',              'Construcción',                   120),
  ('agricultura',               'Agricultura',                    130),
  ('entretenimiento_eventos',   'Entretenimiento y eventos',      140),
  ('otro',                      'Otro',                           999)
ON CONFLICT (slug) DO NOTHING;

-- PASO 3: FK nueva en organizations (nullable, no rompe nada existente)

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS industry_id BIGINT REFERENCES industries(id);
CREATE INDEX IF NOT EXISTS idx_organizations_industry ON organizations(industry_id);

-- PASO 4: backfill desde el enum viejo (organizations.industry, ej.
-- 'ALIMENTOS_BEBIDAS') a la fila equivalente por slug en minúscula.

UPDATE organizations o
SET industry_id = i.id
FROM industries i
WHERE o.industry IS NOT NULL
  AND o.industry_id IS NULL
  AND LOWER(o.industry) = i.slug;

-- PASO 5: verificación — no debe quedar ninguna org con industry viejo
-- seteado que no haya encontrado equivalente (debe devolver 0 filas).

SELECT id, name, industry FROM organizations
WHERE industry IS NOT NULL AND industry_id IS NULL;

-- PASO 6: retirar el enum viejo (columna + constraint de v4.9).

ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_industry_check;
ALTER TABLE organizations DROP COLUMN IF EXISTS industry;
