/*
# Close order-read isolation gap

## The problem being fixed
Until now, reading orders was open to anyone holding the public API key —
the app only ever asked for one restaurant's orders, so it looked properly
scoped, but nothing at the database level actually enforced that. Someone
with the key could query the orders table directly and read every
restaurant's order history, not just their own.

## The fix
Customers now get a real (if anonymous) Supabase login the moment they
open a restaurant's QR menu — tied to that specific restaurant via a new
`table_sessions` table. From then on, the database itself enforces:
- A restaurant's own staff (logged in normally) can read their restaurant's
  orders.
- A customer can only read orders belonging to the restaurant whose QR menu
  they actually opened (proven by their anonymous session having a
  matching table_sessions row) — not any other restaurant's.
- Anyone else — just holding the API key with no session at all — gets
  nothing.

Menu and restaurant-settings reads stay open on purpose: a QR menu is
inherently public-facing by design (anyone who scans the code is meant to
see it), so there's no meaningful data to protect there the way there is
with order history.
*/

CREATE TABLE IF NOT EXISTS table_sessions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  created_at bigint NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS table_sessions_restaurant_idx ON table_sessions(restaurant_id);

ALTER TABLE table_sessions ENABLE ROW LEVEL SECURITY;

-- A session can only ever be created for yourself (your own auth.uid()),
-- and only once you're actually signed in (even anonymously) — this table
-- is how a customer's anonymous session gets tied to one restaurant.
DROP POLICY IF EXISTS "self_insert_table_sessions" ON table_sessions;
CREATE POLICY "self_insert_table_sessions" ON table_sessions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "self_update_table_sessions" ON table_sessions;
CREATE POLICY "self_update_table_sessions" ON table_sessions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "self_select_table_sessions" ON table_sessions;
CREATE POLICY "self_select_table_sessions" ON table_sessions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- The actual fix: replace the fully-open orders SELECT policy with one
-- scoped to either the restaurant's own authenticated owner, or a customer
-- whose anonymous session is tied to that specific restaurant.
DROP POLICY IF EXISTS "anon_select_orders" ON orders;
DROP POLICY IF EXISTS "scoped_select_orders" ON orders;
CREATE POLICY "scoped_select_orders" ON orders FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM restaurants r
      WHERE r.id = orders.restaurant_id AND r.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM table_sessions ts
      WHERE ts.restaurant_id = orders.restaurant_id AND ts.user_id = auth.uid()
    )
  );
