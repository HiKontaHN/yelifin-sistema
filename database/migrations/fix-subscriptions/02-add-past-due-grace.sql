-- Gracia de pago para suscripciones PAST_DUE.
-- Idempotente y preparado para ejecución manual en producción.
-- Debe ejecutarse después de 01-create-free-plan.sql.

ALTER TABLE org_subscriptions
  ADD COLUMN IF NOT EXISTS past_due_since TIMESTAMPTZ;

COMMENT ON COLUMN org_subscriptions.past_due_since IS
  'Instante de la primera transición al estado PAST_DUE actual; se limpia al salir de ese estado.';

-- Las filas que ya estaban en mora reciben la hora del despliegue. Se hace
-- antes de agregar el CHECK para no usar updated_at (no representa de forma
-- confiable el inicio de la mora) y para evitar gracia nula o infinita.
UPDATE org_subscriptions
SET past_due_since = NOW()
WHERE status = 'PAST_DUE'
  AND past_due_since IS NULL;

CREATE OR REPLACE FUNCTION set_org_subscription_past_due_since()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'PAST_DUE' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.past_due_since := COALESCE(NEW.past_due_since, NOW());
    ELSIF OLD.status IS DISTINCT FROM 'PAST_DUE' THEN
      NEW.past_due_since := COALESCE(NEW.past_due_since, NOW());
    ELSE
      -- Una actualización mientras sigue PAST_DUE nunca reinicia el reloj.
      NEW.past_due_since := OLD.past_due_since;
    END IF;
  ELSE
    NEW.past_due_since := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_org_subscriptions_past_due_since ON org_subscriptions;

CREATE TRIGGER trg_org_subscriptions_past_due_since
BEFORE INSERT OR UPDATE ON org_subscriptions
FOR EACH ROW
EXECUTE FUNCTION set_org_subscription_past_due_since();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'org_subscriptions'::regclass
      AND conname = 'org_subscriptions_past_due_since_required'
  ) THEN
    ALTER TABLE org_subscriptions
      ADD CONSTRAINT org_subscriptions_past_due_since_required
      CHECK (status <> 'PAST_DUE' OR past_due_since IS NOT NULL);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_org_subscriptions_past_due_since
  ON org_subscriptions(past_due_since)
  WHERE status = 'PAST_DUE';

-- Política central de plan efectivo:
--   * El destino se resuelve por slug 'free' solamente aquí.
--   * Solo 'basico' y 'pro' son planes facturables degradables.
--   * El día local en que inicia la mora no cuenta. La gracia termina en la
--     medianoche local del día de past_due_since + 6 días. Ejemplo: si la
--     mora inicia el lunes a las 10:00, conserva el plan contratado durante
--     martes a sábado completos y se degrada al comenzar el domingo.
--   * La zona es organizations.timezone; NULL usa America/Tegucigalpa.
--   * Un past_due_since NULL nunca concede gracia: se considera degradado
--     para un plan facturable, aunque el trigger y el CHECK deben impedirlo.
CREATE OR REPLACE VIEW org_effective_subscriptions AS
WITH policy AS (
  SELECT
    ARRAY['basico', 'pro']::TEXT[] AS billable_plan_slugs,
    (SELECT id FROM subscription_plans WHERE slug = 'free') AS fallback_plan_id
), calculated AS (
  SELECT
    os.*,
    os.plan_id AS contracted_plan_id,
    contracted.slug AS contracted_plan_slug,
    policy.fallback_plan_id,
    contracted.slug = ANY(policy.billable_plan_slugs) AS is_billable,
    CASE
      WHEN os.past_due_since IS NULL THEN NULL
      ELSE (
        (os.past_due_since AT TIME ZONE COALESCE(o.timezone, 'America/Tegucigalpa'))::date + 6
      )::timestamp AT TIME ZONE COALESCE(o.timezone, 'America/Tegucigalpa')
    END AS grace_ends_at
  FROM org_subscriptions os
  JOIN organizations o ON o.id = os.org_id
  JOIN subscription_plans contracted ON contracted.id = os.plan_id
  CROSS JOIN policy
)
SELECT
  calculated.*,
  CASE
    WHEN status = 'PAST_DUE'
      AND is_billable
      AND (past_due_since IS NULL OR NOW() >= grace_ends_at)
      THEN fallback_plan_id
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
  ) AS is_degraded
FROM calculated;

COMMENT ON VIEW org_effective_subscriptions IS
  'Suscripción contratada y plan efectivo con gracia PAST_DUE por días calendario en la zona de la organización.';
