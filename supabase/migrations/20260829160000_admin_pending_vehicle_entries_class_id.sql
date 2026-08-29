-- admin_list_pending_vehicle_entries: also return class_id for pending model
-- rows. The admin edit dialog (VehicleBrandsTab) needs to round-trip a
-- pending model's existing class assignment unchanged when only correcting
-- its name — admin_update_vehicle_model(id, name, class_id) always writes
-- whatever class_id it's given, so omitting it would silently clear an
-- already-set class on every rename.
--
-- DROP FUNCTION is required (not CREATE OR REPLACE) because the return type
-- (RETURNS TABLE columns) is changing; this drops prior GRANTs, re-applied
-- below to match the "admin_%" authenticated grant from
-- 20260812112000_harden_function_privileges_and_search_logging.sql.
DROP FUNCTION IF EXISTS public.admin_list_pending_vehicle_entries();

CREATE FUNCTION public.admin_list_pending_vehicle_entries() RETURNS TABLE(kind text, id uuid, name text, category_group text, brand_name text, class_id uuid, submitted_by uuid, submitted_by_name text, created_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
    SELECT 'brand'::text, b.id, b.name, b.category_group, NULL::text, NULL::uuid,
      b.submitted_by, p.display_name, b.created_at
    FROM public.vehicle_brands b
    LEFT JOIN public.profiles p ON p.id = b.submitted_by
    WHERE b.status = 'pending'
    UNION ALL
    SELECT 'model'::text, m.id, m.name, br.category_group, br.name, m.class_id,
      m.submitted_by, p.display_name, m.created_at
    FROM public.vehicle_models m
    JOIN public.vehicle_brands br ON br.id = m.brand_id
    LEFT JOIN public.profiles p ON p.id = m.submitted_by
    WHERE m.status = 'pending'
    UNION ALL
    SELECT 'class'::text, mc.id, mc.name, br.category_group, br.name, NULL::uuid,
      mc.submitted_by, p.display_name, mc.created_at
    FROM public.vehicle_model_classes mc
    JOIN public.vehicle_brands br ON br.id = mc.brand_id
    LEFT JOIN public.profiles p ON p.id = mc.submitted_by
    WHERE mc.status = 'pending'
    ORDER BY created_at DESC;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_list_pending_vehicle_entries() TO authenticated;
