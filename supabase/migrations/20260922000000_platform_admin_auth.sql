/*
# Real platform admin authentication

## The problem being fixed
Platform admin actions (approving/rejecting/suspending/deleting a
restaurant) were only gated by a password screen in the React app
(PlatformAdmin.tsx). That password was checked client-side, which means
two separate holes:

1. The password itself (VITE_PLATFORM_ADMIN_PASSWORD) is compiled into
   the public JS bundle at build time — anyone can read it via
   view-source, regardless of how "secret" it's kept in Vercel.
2. Worse: the underlying database function (`set_restaurant_status`) had
   no protection of its own — it was granted to `anon` with no check on
   who's calling it. Anyone holding the public anon key (which is public
   by design in every Supabase app) could call it directly via the
   Supabase client and bypass the password screen entirely.

## The fix
A real `platform_admins` table, keyed to actual Supabase Auth accounts.
Only rows in this table can call the platform-admin functions below —
enforced in the database itself, not in the browser. To make someone a
platform admin: have them sign up a normal account (e.g. via the existing
restaurant signup form, or `supabase.auth.admin.createUser` from the
Supabase dashboard), then insert their user id here:

    insert into platform_admins (user_id) values ('<their auth.users id>');

## Still open (not fixed by this migration — flagged, not solved here)
- `restaurants` SELECT is public by design (customers need to read menu
  data anonymously), but `select('*')` also exposes `master_pin` — the
  legacy PIN — to anyone who queries the table directly, not just via the
  app's UI. Closing this needs a public-safe view or column-level split
  and is a separate follow-up.
- `owner_delete_restaurants` still allows anon to delete any restaurant
  with `owner_id IS NULL` (an "unclaimed" restaurant) — not just its
  rightful owner. Platform-admin deletes now go through the secured
  function below instead, but this underlying policy is unchanged.
*/

CREATE TABLE IF NOT EXISTS platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at bigint NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

-- Someone can check whether *they themselves* are a platform admin (used
-- by the app to decide whether to show the panel at all); nobody can list
-- or see anyone else's row.
DROP POLICY IF EXISTS "self_select_platform_admins" ON platform_admins;
CREATE POLICY "self_select_platform_admins" ON platform_admins FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Re-secure set_restaurant_status: now requires being signed in AND being
-- a platform admin, checked inside the function (SECURITY DEFINER means
-- it runs with elevated rights, so this check is the only thing standing
-- between "any authenticated user" and changing any restaurant's status —
-- do not remove it).
CREATE OR REPLACE FUNCTION set_restaurant_status(target_id uuid, new_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF new_status NOT IN ('pending', 'approved', 'rejected', 'suspended') THEN
    RAISE EXCEPTION 'Invalid status: %', new_status;
  END IF;
  UPDATE restaurants SET status = new_status WHERE id = target_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION set_restaurant_status(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION set_restaurant_status(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION set_restaurant_status(uuid, text) TO authenticated;

-- New: a dedicated, secured delete path for the platform admin panel, so
-- deleting a restaurant from that screen no longer relies on the looser
-- owner_delete_restaurants table policy (see note above).
CREATE OR REPLACE FUNCTION platform_delete_restaurant(target_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM restaurants WHERE id = target_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION platform_delete_restaurant(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION platform_delete_restaurant(uuid) FROM public;
GRANT EXECUTE ON FUNCTION platform_delete_restaurant(uuid) TO authenticated;

-- New: a secured "list everything" path for the platform admin dashboard,
-- so that endpoint also requires being a platform admin rather than
-- relying on the public restaurants SELECT policy (which stays open and
-- unrestricted for the QR-menu use case, by design).
CREATE OR REPLACE FUNCTION platform_list_restaurants()
RETURNS SETOF restaurants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY SELECT * FROM restaurants ORDER BY created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION platform_list_restaurants() FROM anon;
REVOKE EXECUTE ON FUNCTION platform_list_restaurants() FROM public;
GRANT EXECUTE ON FUNCTION platform_list_restaurants() TO authenticated;
