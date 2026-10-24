/*
 * Tenant management RLS hardening.
 *
 * A restaurant with no owner_id must NOT be treated as open for management
 * writes. New restaurants are created by the SECURITY DEFINER signup trigger
 * (handle_new_restaurant_signup) / create_restaurant RPC, not by direct anon
 * inserts. This migration preserves public menu reads and customer order
 * inserts while requiring an exact owner match for management mutations.
 */

-- Restaurant rows are public for resolving a QR/menu slug, but only the
-- authenticated owner may edit or delete a restaurant.
DROP POLICY IF EXISTS "anon_insert_restaurants" ON public.restaurants;
DROP POLICY IF EXISTS "owner_update_restaurants" ON public.restaurants;
CREATE POLICY "owner_update_restaurants" ON public.restaurants
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "owner_delete_restaurants" ON public.restaurants;
CREATE POLICY "owner_delete_restaurants" ON public.restaurants
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- Menu management must belong to the exact authenticated owner. Public SELECT
-- remains enabled for customer QR menus.
DROP POLICY IF EXISTS "owner_insert_menu_items" ON public.menu_items;
CREATE POLICY "owner_insert_menu_items" ON public.menu_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = menu_items.restaurant_id AND r.owner_id = auth.uid()
  ));

DROP POLICY IF EXISTS "owner_update_menu_items" ON public.menu_items;
CREATE POLICY "owner_update_menu_items" ON public.menu_items
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = menu_items.restaurant_id AND r.owner_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = menu_items.restaurant_id AND r.owner_id = auth.uid()
  ));

DROP POLICY IF EXISTS "owner_delete_menu_items" ON public.menu_items;
CREATE POLICY "owner_delete_menu_items" ON public.menu_items
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = menu_items.restaurant_id AND r.owner_id = auth.uid()
  ));

-- Orders may still be created by customers without an account, but changing
-- or deleting an order requires the owner of its restaurant.
DROP POLICY IF EXISTS "owner_update_orders" ON public.orders;
CREATE POLICY "owner_update_orders" ON public.orders
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = orders.restaurant_id AND r.owner_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = orders.restaurant_id AND r.owner_id = auth.uid()
  ));

DROP POLICY IF EXISTS "owner_delete_orders" ON public.orders;
CREATE POLICY "owner_delete_orders" ON public.orders
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = orders.restaurant_id AND r.owner_id = auth.uid()
  ));
