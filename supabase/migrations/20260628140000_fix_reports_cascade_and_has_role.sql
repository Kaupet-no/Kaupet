-- no transaction

-- Fix 1: Change reports.listing_id from ON DELETE CASCADE to ON DELETE SET NULL
-- so that reports are preserved when a listing is deleted.
ALTER TABLE public.reports ALTER COLUMN listing_id DROP NOT NULL;
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_listing_id_fkey;
ALTER TABLE public.reports
  ADD CONSTRAINT reports_listing_id_fkey
  FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE SET NULL;

-- Fix 2: Rewrite admin_list_reports to use direct user_roles lookup instead of
-- has_role(), which takes public.app_role and can fail with the newly added
-- 'moderator' enum value depending on plan cache state.
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
      l.kaupet_code,
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

-- Fix admin_resolve_report similarly
CREATE OR REPLACE FUNCTION public.admin_resolve_report(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role::text IN ('admin', 'moderator')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.reports
  SET status = 'resolved', resolved_at = now(), resolved_by = auth.uid()
  WHERE id = _id;
END $$;
REVOKE ALL ON FUNCTION public.admin_resolve_report FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_report TO authenticated;
