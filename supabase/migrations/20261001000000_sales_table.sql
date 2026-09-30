/*
# Sales table — permanent, cloud-saved billing history with payment method

## Why
Until now, every completed bill was saved ONLY in the browser's local
storage on the one device that generated it (see storage.ts), and the live
order was then deleted from the database. That meant a cafe's revenue
history disappeared if staff cleared their browser, switched phone/tablet,
or billed from a second device — and Reports on one device couldn't see
bills made on another.

This table is the fix: each bill is now also saved here, per restaurant,
along with HOW it was paid (cash / UPI / card) so Reports can show the
split.

## Security model
- Only the signed-in owner of a restaurant can read or add its sales.
  Customers (anonymous) can never see revenue.
- There is deliberately NO update or delete policy: a recorded sale can't
  be altered or removed through the API, only by deleting the whole
  restaurant (the foreign key cascades).
- (restaurant_id, id) is the primary key, so two restaurants can never
  collide on the same sale id.

Safe to run more than once.
*/

CREATE TABLE IF NOT EXISTS sales (
  id text NOT NULL,
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  table_number integer NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  -- Nullable on purpose: old sales uploaded from a device's history have no
  -- recorded method. New bills always set one.
  payment_method text CHECK (payment_method IN ('cash', 'upi', 'card')),
  paid_at bigint NOT NULL,
  created_at bigint NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint,
  PRIMARY KEY (restaurant_id, id)
);

CREATE INDEX IF NOT EXISTS sales_restaurant_paid_at_idx
  ON sales (restaurant_id, paid_at DESC);

ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_select_sales" ON sales;
CREATE POLICY "owner_select_sales" ON sales FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM restaurants r
      WHERE r.id = sales.restaurant_id
      AND r.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "owner_insert_sales" ON sales;
CREATE POLICY "owner_insert_sales" ON sales FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM restaurants r
      WHERE r.id = sales.restaurant_id
      AND r.owner_id = auth.uid()
    )
  );

-- Explicit table permission for signed-in users (RLS above still limits each
-- owner to their own restaurant's rows). Redundant on projects where Supabase
-- grants this automatically; prevents a silent "permission denied" on ones
-- where it doesn't. Deliberately no UPDATE/DELETE.
GRANT SELECT, INSERT ON sales TO authenticated;
