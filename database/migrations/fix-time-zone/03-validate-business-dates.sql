-- ================================================================
-- FIX TIME ZONE / 03
-- Validaciones que deben fallar y revertir la migración si falta información.
-- ================================================================

DO $$
DECLARE
  invalid_timezone_count BIGINT;
  missing_date_count BIGINT;
BEGIN
  SELECT COUNT(*)
  INTO invalid_timezone_count
  FROM organizations o
  WHERE o.timezone IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM pg_timezone_names z
       WHERE z.name = o.timezone
     );

  IF invalid_timezone_count > 0 THEN
    RAISE EXCEPTION 'Hay % organizaciones sin una zona IANA válida', invalid_timezone_count;
  END IF;

  SELECT
      (SELECT COUNT(*) FROM transactions WHERE effective_date IS NULL)
    + (SELECT COUNT(*) FROM credit_card_transactions WHERE effective_date IS NULL)
    + (SELECT COUNT(*) FROM sales WHERE sale_date IS NULL)
    + (SELECT COUNT(*) FROM purchase_batches WHERE purchase_date IS NULL)
    + (SELECT COUNT(*) FROM supply_purchases WHERE purchase_date IS NULL)
    + (SELECT COUNT(*) FROM inventory_batches WHERE received_date IS NULL)
    + (SELECT COUNT(*) FROM events WHERE starts_at IS NOT NULL AND start_date IS NULL)
    + (SELECT COUNT(*) FROM events WHERE ends_at IS NOT NULL AND end_date IS NULL)
  INTO missing_date_count;

  IF missing_date_count > 0 THEN
    RAISE EXCEPTION 'Hay % registros sin fecha de negocio', missing_date_count;
  END IF;
END;
$$;

