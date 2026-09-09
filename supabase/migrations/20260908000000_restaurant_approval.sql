/*
# Restaurant approval status + platform admin controls

## Purpose
New restaurant signups now require approval before they can use their
dashboard. Existing restaurants (created before this migration) are
grandfathered in as already-approved, so nothing changes for them.

## Changes
- `restaurants.status` (text, default 'approved') — one of 'pending',
  'approved', 'rejected'. New signups are inserted with 'pending' by the
  app; this column defaults to 'approved' so the migration itself doesn't
  need to touch any existing rows.

## Platform admin approval function
There's no separate "platform admin" user account system yet — approving
or rejecting a restaurant is gated client-side by a password screen (the
same trade-off already used for the legacy PIN system elsewhere in this
app). Because whoever runs that screen isn't the restaurant's own owner,
the normal ownership-based RLS policies would block them from changing
another restaurant's status. This function runs with elevated privileges
(SECURITY DEFINER) specifically to allow that one, narrow action —
changing only the status field, only to one of the three valid values —
without opening up broader access to the table.
*/

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved';

CREATE OR REPLACE FUNCTION set_restaurant_status(target_id uuid, new_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF new_status NOT IN ('pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid status: %', new_status;
  END IF;
  UPDATE restaurants SET status = new_status WHERE id = target_id;
END;
$$;

GRANT EXECUTE ON FUNCTION set_restaurant_status(uuid, text) TO anon, authenticated;
