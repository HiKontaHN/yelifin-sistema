-- v4.9 — Industria del negocio
-- Se selecciona en el onboarding (paso "Moneda", junto con la moneda) y se
-- puede editar después en /settings/organization. Nullable: las orgs
-- existentes no tienen valor hasta que el dueño lo actualice.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS industry VARCHAR(30);

ALTER TABLE organizations
  ADD CONSTRAINT organizations_industry_check CHECK (industry IN (
    'TECNOLOGIA', 'SALUD', 'ALIMENTOS_BEBIDAS', 'MODA_ACCESORIOS',
    'BELLEZA_CUIDADO_PERSONAL', 'HOGAR_DECORACION', 'EDUCACION',
    'SERVICIOS_PROFESIONALES', 'COMERCIO_RETAIL', 'MANUFACTURA_ARTESANIAS',
    'AUTOMOTRIZ', 'CONSTRUCCION', 'AGRICULTURA', 'ENTRETENIMIENTO_EVENTOS',
    'OTRO'
  ));

COMMENT ON COLUMN organizations.industry IS
  'Industria/rubro del negocio, elegido en onboarding. NULL = no seleccionado (orgs previas a esta migración).';
