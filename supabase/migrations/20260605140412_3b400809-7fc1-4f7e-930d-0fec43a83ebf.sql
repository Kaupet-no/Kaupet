
CREATE POLICY "Admins can view all listings"
  ON public.listings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.admin_search_listings(_query text DEFAULT '', _status text DEFAULT NULL, _limit int DEFAULT 50)
RETURNS TABLE(id uuid, title text, status listing_status, seller_id uuid, seller_name text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
  SELECT l.id, l.title, l.status, l.seller_id, p.display_name, l.created_at
  FROM public.listings l
  LEFT JOIN public.profiles p ON p.id = l.seller_id
  WHERE (_query = '' OR l.title ILIKE '%' || _query || '%')
    AND (_status IS NULL OR l.status::text = _status)
  ORDER BY l.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 200));
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_suspensions()
RETURNS TABLE(id uuid, user_id uuid, display_name text, reason text, suspended_by uuid, created_at timestamptz, expires_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
  SELECT s.id, s.user_id, p.display_name, s.reason, s.suspended_by, s.created_at, s.expires_at
  FROM public.user_suspensions s
  LEFT JOIN public.profiles p ON p.id = s.user_id
  WHERE s.expires_at > now()
  ORDER BY s.expires_at DESC;
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_bans()
RETURNS TABLE(user_id uuid, display_name text, reason text, banned_by uuid, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
  SELECT b.user_id, p.display_name, b.reason, b.banned_by, b.created_at
  FROM public.user_bans b
  LEFT JOIN public.profiles p ON p.id = b.user_id
  ORDER BY b.created_at DESC;
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_ip_bans()
RETURNS TABLE(id uuid, ip_address inet, reason text, banned_by uuid, created_at timestamptz, expires_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
  SELECT i.id, i.ip_address, i.reason, i.banned_by, i.created_at, i.expires_at
  FROM public.ip_bans i
  WHERE i.expires_at IS NULL OR i.expires_at > now()
  ORDER BY i.created_at DESC;
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_moderation_log(_limit int DEFAULT 100)
RETURNS TABLE(id uuid, admin_id uuid, admin_name text, action text, target_type text, target_id text, reason text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
  SELECT l.id, l.admin_id, p.display_name, l.action, l.target_type, l.target_id, l.reason, l.created_at
  FROM public.admin_moderation_log l
  LEFT JOIN public.profiles p ON p.id = l.admin_id
  ORDER BY l.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 500));
END $$;

CREATE OR REPLACE FUNCTION public.is_ip_banned(_ip inet)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ip_bans
    WHERE ip_address = _ip AND (expires_at IS NULL OR expires_at > now())
  );
$$;
