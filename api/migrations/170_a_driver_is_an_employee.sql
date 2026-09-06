-- 166 gave fulfillments.dropoffs a driver, and pointed it at auth.users while
-- its two siblings - fulfillments.pickups.assigned_employee_id and
-- fulfillments.directs.assigned_employee_id - point at auth.employees. The
-- screens' Driver select is one select; an id that is an employee on two
-- handovers and a user on the third is a defect waiting for the third screen.
--
-- The table holds no rows, so this re-points a key rather than moving data.
-- `exchange` is neither read nor written.

ALTER TABLE fulfillments.dropoffs DROP CONSTRAINT IF EXISTS dropoffs_driver_fk;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dropoffs_driver_employee_fk') THEN
    ALTER TABLE fulfillments.dropoffs ADD CONSTRAINT dropoffs_driver_employee_fk
      FOREIGN KEY (driver_employee_id) REFERENCES auth.employees (id) ON DELETE SET NULL;
  END IF;
END $$;
