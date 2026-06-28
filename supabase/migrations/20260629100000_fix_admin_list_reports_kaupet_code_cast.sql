-- no transaction

-- Fix: kaupet_code is char(8), not text — cast explicitly to match RETURNS TABLE declaration
CREATE OR REPLACE FUNCTION public.admin_list_reports(_limit int DEFAULT 100)
RETURNS TABLE(
  id uuid,
  created_at timestamptz,
  listing_id uuid,
  kaupet_code text,
  listing_title text,
  reporter_id uuid,
  reporter_name text,
  owner_id uuid,
  owner_name text,
  reason text,
  comment text,
  status text,
  resolved_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role::text IN ('admin', 'moderator')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
    SELECT
      r.id,
      r.created_at,
      r.listing_id,
      l.kaupet_code::text,
      l.title AS listing_title,
      r.reporter_id,
      rp.display_name AS reporter_name,
      l.seller_id AS owner_id,
      op.display_name AS owner_name,
      r.reason,
      r.comment,
      r.status,
      r.resolved_at
    FROM public.reports r
    LEFT JOIN public.listings l ON l.id = r.listing_id
    LEFT JOIN public.profiles rp ON rp.id = r.reporter_id
    LEFT JOIN public.profiles op ON op.id = l.seller_id
    ORDER BY r.created_at DESC
    LIMIT _limit;
END $$;
REVOKE ALL ON FUNCTION public.admin_list_reports FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_reports TO authenticated;
