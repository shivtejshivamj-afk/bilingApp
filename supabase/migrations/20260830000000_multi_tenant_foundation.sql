/*
# Multi-tenant foundation: restaurants, menu_items, and tenant-scoping

## Purpose
Moves this app from a single-restaurant tool to a multi-tenant platform
capable of hosting many independent restaurants on one deployment. Every
restaurant gets its own row in `restaurants` (identified by a unique
`slug`, e.g. "bella-cucina"), and every other table is now scoped to a
`restaurant_id` so restaurants' data stays separate.

This migration also finally moves the MENU into the shared database.
Previously menu items and categories lived only in each browser's local
storage — meaning an admin's menu edits never reached other devices, and
made true multi-tenancy impossible (there was nowhere to attach a
restaurant's menu to that restaurant). Menu items now live in `menu_items`,
synced the same way orders already are.

## New Tables

### `restaurants`
The tenant registry. Replaces the old singleton `app_settings` table — each
restaurant now has its own settings row instead of the whole app sharing one.
- `id` (uuid, primary key)
- `slug` (text, unique, not null) — used in the URL, e.g. "bella-cucina"
- `name` (text, not null) — display name
- `master_pin` (text, not null) — this restaurant's own admin PIN
- `tax_rate` (numeric, not null)
- `currency` (text, not null)
- `table_count` (integer, not null)
- `categories` (text[], not null) — this restaurant's menu categories
- `created_at` (bigint, not null)

### `menu_items`
- `id` (text, primary key)
- `restaurant_id` (uuid, references restaurants, not null)
- `name`, `description`, `price`, `category`, `image`, `available`

## Changed Tables

### `orders`
- Added `restaurant_id` (uuid, references restaurants) so each order is
  tied to the restaurant it belongs to. Nullable initially so existing rows
  from before multi-tenancy don't break; new inserts always set it.

## Security
RLS enabled on both new tables, following the same model already used
throughout this app: no per-restaurant login system exists yet (admin
access is still protected by each restaurant's own PIN, checked in the
app itself), so policies use `TO anon, authenticated` with `USING (true)` /
`WITH CHECK (true)`. This is a deliberate, temporary trade-off — real
per-restaurant database-level security requires adding Supabase Auth
accounts per restaurant admin, which is a planned follow-up. For now,
restaurant separation is enforced by the application always filtering
every query by `restaurant_id`, not yet by the database itself.
*/

CREATE TABLE IF NOT EXISTS restaurants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL DEFAULT 'My Restaurant',
  master_pin text NOT NULL DEFAULT '1234',
  tax_rate numeric NOT NULL DEFAULT 8,
  currency text NOT NULL DEFAULT '$',
  table_count integer NOT NULL DEFAULT 12,
  categories text[] NOT NULL DEFAULT ARRAY['Starters', 'Mains', 'Drinks', 'Desserts'],
  created_at bigint NOT NULL DEFAULT 0
);

ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_restaurants" ON restaurants;
CREATE POLICY "anon_select_restaurants" ON restaurants FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_restaurants" ON restaurants;
CREATE POLICY "anon_insert_restaurants" ON restaurants FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_restaurants" ON restaurants;
CREATE POLICY "anon_update_restaurants" ON restaurants FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS menu_items (
  id text PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  price numeric NOT NULL DEFAULT 0,
  category text NOT NULL DEFAULT 'Mains',
  image text NOT NULL DEFAULT '',
  available boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS menu_items_restaurant_idx ON menu_items(restaurant_id);

ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_menu_items" ON menu_items;
CREATE POLICY "anon_select_menu_items" ON menu_items FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_menu_items" ON menu_items;
CREATE POLICY "anon_insert_menu_items" ON menu_items FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_menu_items" ON menu_items;
CREATE POLICY "anon_update_menu_items" ON menu_items FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_menu_items" ON menu_items;
CREATE POLICY "anon_delete_menu_items" ON menu_items FOR DELETE
  TO anon, authenticated USING (true);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS restaurant_id uuid REFERENCES restaurants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS orders_restaurant_idx ON orders(restaurant_id);

-- Realtime for the new tables
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE restaurants;
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN OTHERS THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE menu_items;
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN OTHERS THEN NULL;
  END;
END $$;

-- Migrate your existing single restaurant (from app_settings) into the new
-- restaurants table, so your current data has a home instead of being
-- orphaned by this change. Uses slug 'default' — you can rename this
-- restaurant's slug later from a future admin screen.
INSERT INTO restaurants (slug, name, master_pin, tax_rate, currency, table_count, created_at)
SELECT 'default', restaurant_name, master_pin, tax_rate, currency, table_count, extract(epoch from now()) * 1000
FROM app_settings
WHERE id = 1
ON CONFLICT (slug) DO NOTHING;

-- Attach existing orders to that migrated restaurant
UPDATE orders
SET restaurant_id = (SELECT id FROM restaurants WHERE slug = 'default')
WHERE restaurant_id IS NULL;
