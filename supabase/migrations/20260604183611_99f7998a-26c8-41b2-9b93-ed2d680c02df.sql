
-- Roller
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed første admin
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE email = 'andreas@happypixel.no'
ON CONFLICT DO NOTHING;

-- Kategorier: admin CRUD-policies
CREATE POLICY "Admins can insert categories"
  ON public.categories FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update categories"
  ON public.categories FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete categories"
  ON public.categories FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

GRANT INSERT, UPDATE, DELETE ON public.categories TO authenticated;

-- Admin RPC: oversiktstall
CREATE OR REPLACE FUNCTION public.admin_overview_stats()
RETURNS TABLE(
  views_7d bigint,
  views_30d bigint,
  new_users_30d bigint,
  active_listings bigint,
  total_listings bigint,
  conversations_total bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY SELECT
    (SELECT count(*) FROM public.listing_views WHERE created_at > now() - interval '7 days'),
    (SELECT count(*) FROM public.listing_views WHERE created_at > now() - interval '30 days'),
    (SELECT count(*) FROM public.profiles WHERE created_at > now() - interval '30 days'),
    (SELECT count(*) FROM public.listings WHERE status = 'active'),
    (SELECT count(*) FROM public.listings),
    (SELECT count(*) FROM public.conversations);
END;
$$;

-- Populære annonser
CREATE OR REPLACE FUNCTION public.admin_popular_listings(_limit int DEFAULT 10)
RETURNS TABLE(
  id uuid,
  title text,
  status listing_status,
  view_count bigint,
  favorite_count bigint,
  created_at timestamptz
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
    l.id,
    l.title,
    l.status,
    (SELECT count(*) FROM public.listing_views v WHERE v.listing_id = l.id) AS view_count,
    (SELECT count(*) FROM public.favorites f WHERE f.listing_id = l.id) AS favorite_count,
    l.created_at
  FROM public.listings l
  ORDER BY view_count DESC, favorite_count DESC
  LIMIT _limit;
END;
$$;

-- Populære kategorier
CREATE OR REPLACE FUNCTION public.admin_popular_categories()
RETURNS TABLE(
  id uuid,
  name_nb text,
  slug text,
  listing_count bigint,
  view_count bigint
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
    c.id,
    c.name_nb,
    c.slug,
    (SELECT count(*) FROM public.listings l WHERE l.category_id = c.id) AS listing_count,
    (SELECT count(*) FROM public.listing_views v
       JOIN public.listings l ON l.id = v.listing_id
       WHERE l.category_id = c.id) AS view_count
  FROM public.categories c
  ORDER BY listing_count DESC, view_count DESC;
END;
$$;

-- Visninger tidsserie
CREATE OR REPLACE FUNCTION public.admin_views_timeseries(_days int DEFAULT 30)
RETURNS TABLE(day date, views bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT d::date AS day,
    (SELECT count(*) FROM public.listing_views v WHERE v.created_at::date = d::date) AS views
  FROM generate_series(
    (now() - (_days || ' days')::interval)::date,
    now()::date,
    interval '1 day'
  ) d;
END;
$$;

-- Brukersøk på e-post
CREATE OR REPLACE FUNCTION public.admin_find_users_by_email(_query text)
RETURNS TABLE(
  user_id uuid,
  email text,
  display_name text,
  created_at timestamptz,
  is_admin boolean
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
    public.has_role(u.id, 'admin')
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.email ILIKE '%' || _query || '%'
  ORDER BY u.created_at DESC
  LIMIT 50;
END;
$$;

-- Tildel admin
CREATE OR REPLACE FUNCTION public.admin_grant_role(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, 'admin')
  ON CONFLICT DO NOTHING;
END;
$$;

-- Fjern admin (kan ikke fjerne siste admin eller seg selv hvis eneste)
CREATE OR REPLACE FUNCTION public.admin_revoke_role(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_count int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT count(*) INTO admin_count FROM public.user_roles WHERE role = 'admin';
  IF admin_count <= 1 THEN
    RAISE EXCEPTION 'Kan ikke fjerne siste administrator';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _user_id AND role = 'admin';
END;
$$;
