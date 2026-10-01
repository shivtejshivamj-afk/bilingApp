-- Background web-push subscriptions for restaurant staff devices.
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_restaurant_idx
  ON public.push_subscriptions(restaurant_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_subscriptions_owner_select" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_owner_select"
  ON public.push_subscriptions FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = push_subscriptions.restaurant_id
      AND r.owner_id = auth.uid()
  ));

DROP POLICY IF EXISTS "push_subscriptions_owner_insert" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_owner_insert"
  ON public.push_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = push_subscriptions.restaurant_id
      AND r.owner_id = auth.uid()
  ));

DROP POLICY IF EXISTS "push_subscriptions_owner_update" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_owner_update"
  ON public.push_subscriptions FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = push_subscriptions.restaurant_id
      AND r.owner_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = push_subscriptions.restaurant_id
      AND r.owner_id = auth.uid()
  ));

DROP POLICY IF EXISTS "push_subscriptions_owner_delete" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_owner_delete"
  ON public.push_subscriptions FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = push_subscriptions.restaurant_id
      AND r.owner_id = auth.uid()
  ));
