-- Remove the legacy restaurant Master PIN now that every restaurant uses
-- Supabase Auth email/password login. This migration intentionally preserves
-- restaurant data and all current user-facing features.

-- First replace the Auth signup/create functions so they no longer depend on
-- the legacy restaurant_secrets table.
CREATE OR REPLACE FUNCTION public.handle_new_restaurant_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_slug text;
  new_name text;
BEGIN
  new_slug := lower(trim(COALESCE(NEW.raw_user_meta_data ->> 'restaurant_slug', '')));
  new_name := trim(COALESCE(NEW.raw_user_meta_data ->> 'restaurant_name', ''));

  IF new_slug = '' OR new_name = '' THEN
    RETURN NEW;
  END IF;

  IF new_slug IN ('_platform', '_support') THEN
    RAISE EXCEPTION 'That restaurant URL is reserved';
  END IF;

  IF new_slug !~ '^[a-z0-9-]{1,60}$' THEN
    RAISE EXCEPTION 'Invalid restaurant URL';
  END IF;

  INSERT INTO public.restaurants (slug, name, owner_id, status, created_at)
  VALUES (new_slug, new_name, NEW.id, 'pending', (extract(epoch from now()) * 1000)::bigint);

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_restaurant(new_slug text, new_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_restaurant_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF new_slug IN ('_platform', '_support') OR new_slug !~ '^[a-z0-9-]{1,60}$' THEN
    RAISE EXCEPTION 'Invalid restaurant URL';
  END IF;

  INSERT INTO public.restaurants (slug, name, owner_id, status, created_at)
  VALUES (lower(trim(new_slug)), trim(new_name), auth.uid(), 'pending',
          (extract(epoch from now()) * 1000)::bigint)
  RETURNING id INTO new_restaurant_id;

  RETURN new_restaurant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_restaurant(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_restaurant(text, text) TO authenticated;

-- The migration that introduced the legacy PIN functions granted them to the
-- browser roles. Remove them entirely; they are no longer part of the auth
-- model and should not remain callable through the Supabase API.
DROP FUNCTION IF EXISTS public.verify_restaurant_pin(uuid, text);
DROP FUNCTION IF EXISTS public.claim_restaurant(uuid, text);

-- Remove the private compatibility store after the old RPCs are gone.
DROP TABLE IF EXISTS public.restaurant_secrets;

-- The public tenant table should contain no PIN credential.
ALTER TABLE public.restaurants DROP COLUMN IF EXISTS master_pin;

-- Older single-tenant settings migrations also created a master_pin column.
-- The current application does not use this legacy table, so remove only the
-- credential column and preserve the rest of the table for compatibility.
DO $$
BEGIN
  IF to_regclass('public.app_settings') IS NOT NULL THEN
    ALTER TABLE public.app_settings DROP COLUMN IF EXISTS master_pin;
  END IF;
END $$;
