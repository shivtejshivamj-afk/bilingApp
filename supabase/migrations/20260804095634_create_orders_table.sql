/*
# Create orders table for real-time restaurant ordering

## Purpose
Stores customer and manual orders so they sync across devices in real time.
Previously orders lived only in browser localStorage, which meant a customer
ordering on their phone never appeared on the admin dashboard running on a
different device. This table moves orders to the shared Supabase database
with realtime subscriptions so every device sees the same orders instantly.

## New Tables
- `orders`
  - `id` (text, primary key) — client-generated order id (e.g. ord_<ts>_<rand>)
  - `table_number` (integer, not null) — table the order belongs to
  - `items` (jsonb, not null) — array of OrderItem objects {menuItemId, name, price, quantity, status}
  - `subtotal` (numeric, not null) — pre-tax total
  - `tax` (numeric, not null) — tax amount
  - `total` (numeric, not null) — final total
  - `status` (text, not null, default 'New') — New | Acknowledged | Ready | Billed
  - `customer_note` (text, nullable) — optional note from customer
  - `created_at` (bigint, not null) — epoch millis timestamp from client

## Security
- RLS enabled on `orders`.
- This is a single-tenant app with no sign-in screen, so all CRUD policies
  use `TO anon, authenticated` with `USING (true)` / `WITH CHECK (true)`
  because the order data is intentionally shared across all devices
  (customers and staff both need full access without authentication).
*/

CREATE TABLE IF NOT EXISTS orders (
  id text PRIMARY KEY,
  table_number integer NOT NULL,
  items jsonb NOT NULL,
  subtotal numeric NOT NULL,
  tax numeric NOT NULL,
  total numeric NOT NULL,
  status text NOT NULL DEFAULT 'New',
  customer_note text,
  created_at bigint NOT NULL
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_orders" ON orders;
CREATE POLICY "anon_select_orders" ON orders FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_orders" ON orders;
CREATE POLICY "anon_insert_orders" ON orders FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_orders" ON orders;
CREATE POLICY "anon_update_orders" ON orders FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_orders" ON orders;
CREATE POLICY "anon_delete_orders" ON orders FOR DELETE
  TO anon, authenticated USING (true);

-- Enable realtime publication for the orders table
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
