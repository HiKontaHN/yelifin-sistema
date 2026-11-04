-- ORDEN DE DESPLIEGUE OBLIGATORIO: ejecutar 01, 02, 03, 04 y 05 en producción,
-- en ese orden, ANTES de desplegar el código que consume estas migraciones.
--
-- El vencimiento calculado de la prueba (30 días -> Gratis) aplica SOLO cuando
-- el plan contratado tiene slug 'trial'. Un negocio con status TRIAL pero plan
-- original/basico/pro no se degrada. Misma definición que 02 (mismas columnas y
-- mismo orden, requisito de CREATE OR REPLACE VIEW); 05 es la fuente final.
-- Idempotente.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM subscription_plans WHERE slug = 'free') THEN
    RAISE EXCEPTION
      'Falta subscription_plans.slug=free. Ejecute primero 01-create-free-plan.sql';
  END IF;
END;
$$;

CREATE OR REPLACE VIEW org_effective_subscriptions AS
WITH policy AS (
  SELECT
    ARRAY['basico', 'pro']::TEXT[] AS billable_plan_slugs,
    (SELECT id FROM subscription_plans WHERE slug = 'free') AS fallback_plan_id
), calculated AS (
  SELECT
    os.id,
    os.org_id,
    os.plan_id,
    os.status,
    os.trial_start_date,
    os.trial_end_date,
    os.current_period_start,
    os.current_period_end,
    os.cancel_at_period_end,
    os.cancelled_at,
    os.provider,
    os.provider_customer_id,
    os.provider_subscription_id,
    os.created_at,
    os.updated_at,
    os.past_due_since,
    os.plan_id AS contracted_plan_id,
    contracted.slug AS contracted_plan_slug,
    policy.fallback_plan_id,
    contracted.slug = ANY(policy.billable_plan_slugs) AS is_billable,
    (
      os.status = 'TRIAL'
      AND contracted.slug = 'trial'
      AND NOW() >= (
        COALESCE(os.trial_end_date, os.created_at + INTERVAL '30 days')
        AT TIME ZONE 'UTC'
      )
    ) AS is_trial_expired,
    CASE
      WHEN os.past_due_since IS NULL THEN NULL
      ELSE (
        (os.past_due_since AT TIME ZONE COALESCE(NULLIF(o.timezone, ''), 'America/Tegucigalpa'))::date + 6
      )::timestamp AT TIME ZONE COALESCE(NULLIF(o.timezone, ''), 'America/Tegucigalpa')
    END AS grace_ends_at
  FROM org_subscriptions os
  JOIN organizations o ON o.id = os.org_id
  JOIN subscription_plans contracted ON contracted.id = os.plan_id
  CROSS JOIN policy
)
SELECT
  id,
  org_id,
  plan_id,
  status,
  trial_start_date,
  trial_end_date,
  current_period_start,
  current_period_end,
  cancel_at_period_end,
  cancelled_at,
  provider,
  provider_customer_id,
  provider_subscription_id,
  created_at,
  updated_at,
  past_due_since,
  contracted_plan_id,
  contracted_plan_slug,
  fallback_plan_id,
  is_billable,
  grace_ends_at,
  CASE
    WHEN is_trial_expired
      THEN COALESCE(fallback_plan_id, contracted_plan_id)
    WHEN status = 'PAST_DUE'
      AND is_billable
      AND (past_due_since IS NULL OR NOW() >= grace_ends_at)
      THEN COALESCE(fallback_plan_id, contracted_plan_id)
    ELSE contracted_plan_id
  END AS effective_plan_id,
  (
    status = 'PAST_DUE'
    AND is_billable
    AND past_due_since IS NOT NULL
    AND NOW() < grace_ends_at
  ) AS is_in_grace,
  (
    status = 'PAST_DUE'
    AND is_billable
    AND (past_due_since IS NULL OR NOW() >= grace_ends_at)
  ) AS is_degraded,
  is_trial_expired
FROM calculated;

COMMENT ON VIEW org_effective_subscriptions IS
  'Plan efectivo calculado: gracia PAST_DUE por días locales y TRIAL vencido como Gratis solo para el plan trial; trial_end_date TIMESTAMP se interpreta en UTC.';

COMMIT;
