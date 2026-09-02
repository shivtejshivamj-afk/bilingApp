/*
# Real per-restaurant authentication

## Purpose
Until now, every restaurant's data was protected only by a PIN checked
inside the app itself — the database allowed anyone with the public API
key to read AND write any restaurant's data directly (bypassing the PIN
entirely). This was a deliberate, called-out trade-off during the initial
multi-tenant build. This migration closes that gap using Supabase's real
authentication system.

## Changes

### `restaurants.owner_id`
A new nullable column referencing `auth.users`. NULL means "not yet
claimed" — existing restaurants (created before this migration) start
this way, and their admin can secure them with a real account from the
admin panel without losing access in the meantime. Once claimed, only the
matching authenticated user can modify that restaurant's data.

## Security model going forward
- **Reads** (SELECT) on `restaurants` and `menu_items`, and **inserts** on
  `orders`, stay open to anyone — customers browsing a menu or placing an
  order never log in, by design (that's the whole point of a QR-code
  ordering flow).
- **Writes** (INSERT/UPDATE/DELETE) that represent restaurant management —
  changing settings, editing the menu, updating/cancelling orders — now
  require being authenticated AND owning that restaurant (`auth.uid() =
  restaurants.owner_id`), OR the restaurant not being claimed yet
  (transition period for existing restaurants).
- This does NOT yet lock down who can *read* another restaurant's orders
  via a direct API call (customers need anonymous read access to their own
  table's orders, and there's no clean way to distinguish "a customer at
  this restaurant" from "anyone with the API key" without a customer-side
  session token, which is a larger follow-up). Read-side full isolation is
  a known next step, not part of this migration.
*/

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id);

-- restaurants: reads stay public; writes require ownership (or being unclaimed)
DROP POLICY IF EXISTS "anon_update_restaurants" ON restaurants;
CREATE POLICY "owner_update_restaurants" ON restaurants FOR UPDATE
  TO anon, authenticated
  USING (owner_id IS NULL OR owner_id = auth.uid())
  WITH CHECK (owner_id IS NULL OR owner_id = auth.uid());

-- Restaurant creation (signup) still needs to work before a session may be
-- fully established client-side in some flows, so INSERT stays open; the
-- new restaurant's owner_id is set directly in the insert itself by the app.

-- menu_items: reads public; writes require ownership of the parent restaurant
DROP POLICY IF EXISTS "anon_insert_menu_items" ON menu_items;
CREATE POLICY "owner_insert_menu_items" ON menu_items FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM restaurants r
      WHERE r.id = menu_items.restaurant_id
      AND (r.owner_id IS NULL OR r.owner_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "anon_update_menu_items" ON menu_items;
CREATE POLICY "owner_update_menu_items" ON menu_items FOR UPDATE
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM restaurants r
      WHERE r.id = menu_items.restaurant_id
      AND (r.owner_id IS NULL OR r.owner_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "anon_delete_menu_items" ON menu_items;
CREATE POLICY "owner_delete_menu_items" ON menu_items FOR DELETE
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM restaurants r
      WHERE r.id = menu_items.restaurant_id
      AND (r.owner_id IS NULL OR r.owner_id = auth.uid())
    )
  );

-- orders: customers insert their own orders anonymously (no login) — that
-- stays open. But UPDATE (acknowledging, advancing status, billing) and
-- DELETE (cancelling, clearing a billed table) are restaurant-management
-- actions and now require ownership.
DROP POLICY IF EXISTS "anon_update_orders" ON orders;
CREATE POLICY "owner_update_orders" ON orders FOR UPDATE
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM restaurants r
      WHERE r.id = orders.restaurant_id
      AND (r.owner_id IS NULL OR r.owner_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "anon_delete_orders" ON orders;
CREATE POLICY "owner_delete_orders" ON orders FOR DELETE
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM restaurants r
      WHERE r.id = orders.restaurant_id
      AND (r.owner_id IS NULL OR r.owner_id = auth.uid())
    )
  );
