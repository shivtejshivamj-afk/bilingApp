/*
# Create settings table for shared restaurant settings

## Purpose
Settings (currency symbol, tax rate, restaurant name, table count, etc.)
previously lived only in browser localStorage, which is per-device. This
meant an admin changing the currency symbol on their own device never
reached a customer's phone, which has its own separate localStorage and
silently fell back to the default currency symbol.

This table moves settings to the shared Supabase database (mirroring the
existing `orders` table) with realtime subscriptions, so every device —
admin dashboard, kitchen screen, and customer QR menu — reflects the same
settings instantly.

## New Tables
- `app_settings`
  - `id` (integer, primary key, fixed to 1) — singleton row, this app has
    exactly one settings record shared by everyone
  - `restaurant_name` (text, not null)
  - `master_pin` (text, not null)
  - `tax_rate` (numeric, not null) — percentage, e.g. 8 = 8%
  - `currency` (text, not null) — currency symbol, e.g. '$' or '₹'
  - `lan_url` (text, not null default '')
  - `table_count` (integer, not null)
  - `sound_enabled` (boolean, not null default true)
  - `updated_at` (bigint, not null) — epoch millis, set by client on save

## Security
- RLS enabled on `app_settings`.
- Same single-tenant, no-login model as `orders`: all CRUD policies use
  `TO anon, authenticated` with `USING (true)` / `WITH CHECK (true)`
  because both staff and customers need to read settings without
  authentication, and only the admin UI (protected by the app's own PIN
  screen) exposes the ability to write.
*/

CREATE TABLE IF NOT EXISTS app_settings (
  id integer PRIMARY KEY DEFAULT 1,
  restaurant_name text NOT NULL DEFAULT 'Bella Cucina',
  master_pin text NOT NULL DEFAULT '1234',
  tax_rate numeric NOT NULL DEFAULT 8,
  currency text NOT NULL DEFAULT '$',
  lan_url text NOT NULL DEFAULT '',
  table_count integer NOT NULL DEFAULT 12,
  sound_enabled boolean NOT NULL DEFAULT true,
  updated_at bigint NOT NULL DEFAULT 0,
  CONSTRAINT app_settings_singleton CHECK (id = 1)
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_settings" ON app_settings;
CREATE POLICY "anon_select_settings" ON app_settings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_settings" ON app_settings;
CREATE POLICY "anon_insert_settings" ON app_settings FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_settings" ON app_settings;
CREATE POLICY "anon_update_settings" ON app_settings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

-- Seed the single settings row if it doesn't already exist
INSERT INTO app_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Enable realtime publication for the app_settings table
ALTER PUBLICATION supabase_realtime ADD TABLE app_settings;
