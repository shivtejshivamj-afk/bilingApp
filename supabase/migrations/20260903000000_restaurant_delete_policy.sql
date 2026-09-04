-- No DELETE policy has existed on `restaurants` until now, which means
-- Postgres RLS silently blocks all deletes on it by default (RLS denies
-- any operation with no matching policy). This adds one, using the same
-- ownership rule as the existing UPDATE policy: the authenticated owner
-- can delete their own restaurant, or anyone can delete an unclaimed one
-- (consistent with the transition-period rule used elsewhere).
--
-- Deleting a restaurant cascades to its menu_items and orders automatically
-- (both were set up with ON DELETE CASCADE when their tables were created).

DROP POLICY IF EXISTS "owner_delete_restaurants" ON restaurants;
CREATE POLICY "owner_delete_restaurants" ON restaurants FOR DELETE
  TO anon, authenticated
  USING (owner_id IS NULL OR owner_id = auth.uid());
