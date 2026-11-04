-- Permiso de plan independiente para tarjetas de crédito.
-- Idempotente: crea la feature si falta y sincroniza solo los planes que
-- deben incluirla. Los planes ausentes se ignoran sin error.

INSERT INTO system_features (feature_key, feature_name, category)
VALUES ('finances.credit_cards', 'Tarjetas de crédito', 'FINANCES')
ON CONFLICT (feature_key) DO NOTHING;

INSERT INTO plan_features (plan_id, feature_id, is_enabled)
SELECT p.id, f.id, TRUE
FROM subscription_plans p
JOIN system_features f ON f.feature_key = 'finances.credit_cards'
WHERE p.slug IN ('pro', 'original', 'admin')
ON CONFLICT (plan_id, feature_id) DO UPDATE SET
  is_enabled = EXCLUDED.is_enabled;

-- Una reejecución también corrige cualquier habilitación accidental en los
-- planes que explícitamente no incluyen tarjetas de crédito.
UPDATE plan_features pf
SET is_enabled = FALSE
FROM subscription_plans p, system_features f
WHERE pf.plan_id = p.id
  AND pf.feature_id = f.id
  AND p.slug IN ('free', 'basico', 'trial')
  AND f.feature_key = 'finances.credit_cards';
