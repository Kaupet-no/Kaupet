-- no transaction

-- Extend the existing listing-reports table to also support reporting a
-- user directly (independent of any listing) — listing_id is already
-- nullable from a prior migration, so this just adds the counterpart column.
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS reported_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

DO $$ BEGIN
  ALTER TABLE public.reports
    ADD CONSTRAINT reports_target_check
    CHECK (listing_id IS NOT NULL OR reported_user_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RPC: submit_user_report (any authenticated user)
CREATE OR REPLACE FUNCTION public.submit_user_report(
  _reported_user_id uuid,
  _reason text,
  _comment text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF auth.uid() = _reported_user_id THEN RAISE EXCEPTION 'Cannot report yourself'; END IF;
  INSERT INTO public.reports(reporter_id, reported_user_id, reason, comment)
  VALUES (auth.uid(), _reported_user_id, _reason, _comment);
END $$;
REVOKE ALL ON FUNCTION public.submit_user_report FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_user_report TO authenticated;

-- admin_list_reports: include the reported-user target alongside the
-- existing listing target so user reports show up in the same admin queue.
-- Adding columns changes the function's return type, which CREATE OR REPLACE
-- can't do in place — the existing function must be dropped first.
DROP FUNCTION IF EXISTS public.admin_list_reports(int);
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
  reported_user_id uuid,
  reported_user_name text,
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
      r.reported_user_id,
      ru.display_name AS reported_user_name,
      r.reason,
      r.comment,
      r.status,
      r.resolved_at
    FROM public.reports r
    LEFT JOIN public.listings l ON l.id = r.listing_id
    LEFT JOIN public.profiles rp ON rp.id = r.reporter_id
    LEFT JOIN public.profiles op ON op.id = l.seller_id
    LEFT JOIN public.profiles ru ON ru.id = r.reported_user_id
    ORDER BY r.created_at DESC
    LIMIT _limit;
END $$;
REVOKE ALL ON FUNCTION public.admin_list_reports FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_reports TO authenticated;
