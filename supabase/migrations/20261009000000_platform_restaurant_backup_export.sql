/*
  Secure one-click per-restaurant backup export for Platform Admin.
  Exports restaurant settings (excluding legacy master_pin), menu items,
  orders, and sales. No data is changed or deleted.
*/
CREATE OR REPLACE FUNCTION public.platform_export_restaurant_data(target_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  restaurant_row jsonb;
  menu_rows jsonb;
  order_rows jsonb;
  sales_rows jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized as platform administrator';
  END IF;

  SELECT jsonb_build_object(
    'id', r.id,
    'slug', r.slug,
    'name', r.name,
    'owner_id', r.owner_id,
    'status', r.status,
    'tax_rate', r.tax_rate,
    'currency', r.currency,
    'table_count', r.table_count,
    'categories', r.categories,
    'created_at', r.created_at
  ) INTO restaurant_row
  FROM public.restaurants r
  WHERE r.id = target_id;

  IF restaurant_row IS NULL THEN
    RAISE EXCEPTION 'Restaurant not found';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.name), '[]'::jsonb)
    INTO menu_rows FROM public.menu_items m WHERE m.restaurant_id = target_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(o) ORDER BY o.created_at DESC), '[]'::jsonb)
    INTO order_rows FROM public.orders o WHERE o.restaurant_id = target_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.paid_at DESC), '[]'::jsonb)
    INTO sales_rows FROM public.sales s WHERE s.restaurant_id = target_id;

  RETURN jsonb_build_object(
    'product', 'ScannBite',
    'backup_type', 'single_restaurant',
    'exported_at', now(),
    'restaurant', restaurant_row,
    'summary', jsonb_build_object(
      'menu_items', jsonb_array_length(menu_rows),
      'orders', jsonb_array_length(order_rows),
      'sales_records', jsonb_array_length(sales_rows),
      'sales_total', COALESCE((SELECT SUM(s.total) FROM public.sales s WHERE s.restaurant_id = target_id), 0)
    ),
    'menu_items', menu_rows,
    'orders', order_rows,
    'sales', sales_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_export_restaurant_data(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_export_restaurant_data(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.platform_export_restaurant_data(uuid) TO authenticated;
