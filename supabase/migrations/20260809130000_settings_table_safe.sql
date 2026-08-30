-- SAFE VERSION: run this if the app_settings table didn't get created
-- by the original migration. This version guards the realtime step so
-- it can never roll back the table creation, even if that step fails.

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

INSERT INTO app_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Guarded: this step is safe to skip if it errors, so it can never
-- roll back the table above.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE app_settings;
  EXCEPTION WHEN duplicate_object THEN
    NULL; -- already added, ignore
  WHEN OTHERS THEN
    NULL; -- realtime publication step failed for any other reason, ignore
  END;
END $$;
