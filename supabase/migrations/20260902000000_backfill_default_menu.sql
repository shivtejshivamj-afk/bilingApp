-- Backfills the starter/demo menu for the 'default' restaurant (the one
-- migrated from your original pre-multi-tenant data). New restaurants
-- created through signup already get this seeded automatically by the app
-- — this migration exists only because 'default' was created directly by
-- an earlier SQL migration, which didn't include any menu items.
--
-- Safe to run more than once: it only inserts if 'default' currently has
-- zero menu items, so it won't duplicate anything or overwrite a menu
-- you've since customized.

DO $$
DECLARE
  target_id uuid;
  existing_count integer;
BEGIN
  SELECT id INTO target_id FROM restaurants WHERE slug = 'default';
  IF target_id IS NULL THEN
    RETURN; -- no 'default' restaurant exists, nothing to do
  END IF;

  SELECT count(*) INTO existing_count FROM menu_items WHERE restaurant_id = target_id;
  IF existing_count > 0 THEN
    RETURN; -- already has menu items, don't touch it
  END IF;

  INSERT INTO menu_items (id, restaurant_id, name, description, price, category, image, available) VALUES
    (target_id || '_s1', target_id, 'Classic Bruschetta', 'Toasted ciabatta, vine tomatoes, fresh basil, garlic olive oil.', 7.5, 'Starters', 'https://images.pexels.com/photos/2532006/pexels-photo-2532006.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', true),
    (target_id || '_s2', target_id, 'Caesar Salad', 'Crisp romaine, croutons, parmesan, anchovy dressing.', 8.0, 'Starters', 'https://images.pexels.com/photos/19938473/pexels-photo-19938473.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', true),
    (target_id || '_m1', target_id, 'Signature Cheeseburger', 'Beef patty, aged cheddar, house sauce, brioche bun, fries.', 14.0, 'Mains', 'https://images.pexels.com/photos/17095325/pexels-photo-17095325.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', true),
    (target_id || '_m2', target_id, 'Spaghetti Carbonara', 'Pancetta, egg yolk, pecorino, cracked pepper.', 13.5, 'Mains', 'https://images.pexels.com/photos/546945/pexels-photo-546945.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', true),
    (target_id || '_m3', target_id, 'Grilled Ribeye Steak', '8oz ribeye, roasted tomato, pepper, chimichurri.', 22.0, 'Mains', 'https://images.pexels.com/photos/28292008/pexels-photo-28292008.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', true),
    (target_id || '_d1', target_id, 'Mint Mojito', 'White rum, mint, lime, soda. Refreshing and bright.', 9.0, 'Drinks', 'https://images.pexels.com/photos/7985176/pexels-photo-7985176.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', true),
    (target_id || '_d2', target_id, 'Iced Caramel Latte', 'Double espresso, caramel, cold milk over ice.', 5.5, 'Drinks', 'https://images.pexels.com/photos/35229818/pexels-photo-35229818.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', true),
    (target_id || '_ds1', target_id, 'Chocolate Lava Cake', 'Warm molten center, vanilla bean ice cream.', 7.0, 'Desserts', 'https://images.pexels.com/photos/10249461/pexels-photo-10249461.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', true);
END $$;
