
-- Add moderator role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'moderator';

-- Extend reports table
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS comment TEXT;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES auth.users(id);

-- Allow admins and moderators to view/update reports
CREATE POLICY "Admins and moderators can view reports" ON public.reports
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE POLICY "Admins and moderators can update reports" ON public.reports
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

-- Allow admins and moderators to read moderation log
DROP POLICY IF EXISTS "Admins read moderation log" ON public.admin_moderation_log;
CREATE POLICY "Admins and moderators read moderation log" ON public.admin_moderation_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

-- System messages table
CREATE TABLE public.system_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);
CREATE INDEX system_messages_recipient_idx ON public.system_messages (recipient_id, created_at DESC);
GRANT SELECT, UPDATE ON public.system_messages TO authenticated;
GRANT ALL ON public.system_messages TO service_role;
ALTER TABLE public.system_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own system messages" ON public.system_messages
  FOR SELECT TO authenticated USING (auth.uid() = recipient_id);
CREATE POLICY "Users can mark their system messages as read" ON public.system_messages
  FOR UPDATE TO authenticated USING (auth.uid() = recipient_id);
CREATE POLICY "Admins and moderators can insert system messages" ON public.system_messages
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')
  );

-- RPC: submit_listing_report (any authenticated user)
CREATE OR REPLACE FUNCTION public.submit_listing_report(
  _listing_id uuid,
  _reason text,
  _comment text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.reports(listing_id, reporter_id, reason, comment)
  VALUES (_listing_id, auth.uid(), _reason, _comment);
END $$;
REVOKE ALL ON FUNCTION public.submit_listing_report FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_listing_report TO authenticated;

-- RPC: admin_list_reports
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
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
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

-- RPC: admin_resolve_report
CREATE OR REPLACE FUNCTION public.admin_resolve_report(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.reports
  SET status = 'resolved', resolved_at = now(), resolved_by = auth.uid()
  WHERE id = _id;
END $$;
REVOKE ALL ON FUNCTION public.admin_resolve_report FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_report TO authenticated;

-- RPC: admin_disable_listing_with_message (sends system message to owner)
CREATE OR REPLACE FUNCTION public.admin_disable_listing_with_message(
  _id uuid,
  _reason text,
  _message text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _seller_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT seller_id INTO _seller_id FROM public.listings WHERE id = _id;
  UPDATE public.listings SET status = 'disabled' WHERE id = _id;
  INSERT INTO public.admin_moderation_log(admin_id, action, target_type, target_id, reason)
  VALUES (auth.uid(), 'disable_listing', 'listing', _id::text, _reason);
  IF _seller_id IS NOT NULL THEN
    INSERT INTO public.system_messages(recipient_id, body)
    VALUES (_seller_id, _message);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_disable_listing_with_message FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_disable_listing_with_message TO authenticated;

-- RPC: admin_delete_listing (hard delete + system message to owner)
CREATE OR REPLACE FUNCTION public.admin_delete_listing(_id uuid, _message text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _seller_id uuid;
  _title text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT seller_id, title INTO _seller_id, _title FROM public.listings WHERE id = _id;
  INSERT INTO public.admin_moderation_log(admin_id, action, target_type, target_id, reason)
  VALUES (auth.uid(), 'delete_listing', 'listing', _id::text, _message);
  DELETE FROM public.listings WHERE id = _id;
  IF _seller_id IS NOT NULL THEN
    INSERT INTO public.system_messages(recipient_id, body)
    VALUES (_seller_id, _message);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_delete_listing FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_listing TO authenticated;

-- RPC: admin_grant_moderator_role
CREATE OR REPLACE FUNCTION public.admin_grant_moderator_role(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  INSERT INTO public.user_roles(user_id, role) VALUES (_user_id, 'moderator') ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.admin_grant_moderator_role FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_moderator_role TO authenticated;

-- RPC: admin_revoke_moderator_role
CREATE OR REPLACE FUNCTION public.admin_revoke_moderator_role(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id AND role = 'moderator';
END $$;
REVOKE ALL ON FUNCTION public.admin_revoke_moderator_role FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_moderator_role TO authenticated;

-- Update admin_find_users_by_email to include is_moderator
CREATE OR REPLACE FUNCTION public.admin_find_users_by_email(_query text)
RETURNS TABLE(
  user_id uuid,
  email text,
  display_name text,
  created_at timestamptz,
  is_admin boolean,
  is_demo boolean,
  is_moderator boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    p.display_name,
    u.created_at,
    public.has_role(u.id, 'admin'),
    public.has_role(u.id, 'demo'),
    public.has_role(u.id, 'moderator')
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.email ILIKE '%' || _query || '%'
  ORDER BY u.created_at DESC
  LIMIT 50;
END $$;
REVOKE ALL ON FUNCTION public.admin_find_users_by_email FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_find_users_by_email TO authenticated;
