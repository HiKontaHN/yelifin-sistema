-- Preferencias globales de correo promocional. Los correos transaccionales
-- (seguridad, facturación y operación de la cuenta) no consultan esta tabla.
CREATE TABLE IF NOT EXISTS marketing_email_preferences (
  email VARCHAR(255) PRIMARY KEY,
  opted_out_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_marketing_email_preferences_opted_out
  ON marketing_email_preferences (opted_out_at);
