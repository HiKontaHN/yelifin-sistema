-- Deriva el día solo para registros nuevos sin una fecha de negocio.
-- Actualizar un timestamp no debe mover un registro a otro día contable.
CREATE OR REPLACE FUNCTION sync_legacy_business_date()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  date_column TEXT := TG_ARGV[0];
  timestamp_column TEXT := TG_ARGV[1];
  row_data JSONB;
  legacy_date DATE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    row_data := to_jsonb(NEW);
    IF row_data ->> date_column IS NULL THEN
      legacy_date := (row_data ->> timestamp_column)::TIMESTAMP::DATE;
      NEW := jsonb_populate_record(NEW, jsonb_build_object(date_column, legacy_date));
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
