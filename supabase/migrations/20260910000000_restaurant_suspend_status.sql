-- Adds 'suspended' as a valid restaurant status — for restaurants who
-- signed up and were approved, but whose (manually-collected, offline)
-- payment has lapsed. Suspending blocks their admin dashboard access
-- without deleting anything; re-activating (setting back to 'approved')
-- restores full access instantly, no data loss either way.

CREATE OR REPLACE FUNCTION set_restaurant_status(target_id uuid, new_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF new_status NOT IN ('pending', 'approved', 'rejected', 'suspended') THEN
    RAISE EXCEPTION 'Invalid status: %', new_status;
  END IF;
  UPDATE restaurants SET status = new_status WHERE id = target_id;
END;
$$;

GRANT EXECUTE ON FUNCTION set_restaurant_status(uuid, text) TO anon, authenticated;
