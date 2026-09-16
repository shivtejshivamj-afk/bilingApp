-- Adds a vegetarian/non-vegetarian flag to menu items, so the customer
-- menu can show the familiar veg/non-veg indicator and let people filter
-- by it — a standard expectation for restaurant menus in India.

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS is_veg boolean NOT NULL DEFAULT true;
