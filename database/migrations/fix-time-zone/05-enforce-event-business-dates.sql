-- ================================================================
-- FIX TIME ZONE / 05
-- Los eventos siempre requieren un rango de días calendario completo.
-- ================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM events
    WHERE start_date IS NULL OR end_date IS NULL
  ) THEN
    RAISE EXCEPTION 'Hay eventos sin fecha de inicio o fin';
  END IF;
END;
$$;

ALTER TABLE events
  ALTER COLUMN start_date SET NOT NULL,
  ALTER COLUMN end_date SET NOT NULL;

