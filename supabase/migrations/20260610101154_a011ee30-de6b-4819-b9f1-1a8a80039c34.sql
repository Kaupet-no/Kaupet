UPDATE public.promotion_pricing SET price_nok = 59 WHERE duration_days = 5;

CREATE OR REPLACE FUNCTION public.demo_activate_promotion(_listing_id uuid, _duration_days int)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _seller uuid;
  _status listing_status;
  _price int;
  _promo_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Ikke innlogget'; END IF;
  IF NOT (public.has_role(_uid, 'demo') OR public.has_role(_uid, 'admin')) THEN
    RAISE EXCEPTION 'Demo-tilgang kreves';
  END IF;
  SELECT seller_id, status INTO _seller, _status FROM public.listings WHERE id = _listing_id;
  IF _seller IS NULL THEN RAISE EXCEPTION 'Annonsen finnes ikke'; END IF;
  IF _seller <> _uid THEN RAISE EXCEPTION 'Du eier ikke denne annonsen'; END IF;
  IF _status <> 'active' THEN RAISE EXCEPTION 'Annonsen må være aktiv for å promoteres'; END IF;
  SELECT price_nok INTO _price FROM public.promotion_pricing
    WHERE duration_days = _duration_days AND active = true;
  IF _price IS NULL THEN RAISE EXCEPTION 'Ugyldig pakkevarighet'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.listing_promotions
    WHERE listing_id = _listing_id AND status IN ('active','pending','gifted')
  ) THEN
    RAISE EXCEPTION 'Annonsen har allerede en aktiv eller ventende promotering';
  END IF;
  INSERT INTO public.listing_promotions
    (listing_id, user_id, duration_days, price_nok, status, is_gift, gift_reason,
     granted_by, starts_at, expires_at)
  VALUES
    (_listing_id, _uid, _duration_days, _price, 'gifted', true, 'demo',
     _uid, now(), now() + (_duration_days || ' days')::interval)
  RETURNING id INTO _promo_id;
  RETURN _promo_id;
END;
$$;
REVOKE ALL ON FUNCTION public.demo_activate_promotion(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.demo_activate_promotion(uuid, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_grant_demo_role(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, 'demo') ON CONFLICT DO NOTHING;
  INSERT INTO public.admin_moderation_log(admin_id, action, target_type, target_id)
  VALUES (auth.uid(), 'grant_demo_role', 'user', _user_id::text);
END $$;
REVOKE ALL ON FUNCTION public.admin_grant_demo_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_demo_role(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_revoke_demo_role(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id AND role = 'demo';
  INSERT INTO public.admin_moderation_log(admin_id, action, target_type, target_id)
  VALUES (auth.uid(), 'revoke_demo_role', 'user', _user_id::text);
END $$;
REVOKE ALL ON FUNCTION public.admin_revoke_demo_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_demo_role(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_find_users_by_email(text);
CREATE OR REPLACE FUNCTION public.admin_find_users_by_email(_query text)
 RETURNS TABLE(user_id uuid, email text, display_name text, created_at timestamp with time zone, is_admin boolean, is_demo boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN QUERY
  SELECT u.id, u.email::text, p.display_name, u.created_at,
    public.has_role(u.id, 'admin'), public.has_role(u.id, 'demo')
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.email ILIKE '%' || _query || '%'
  ORDER BY u.created_at DESC LIMIT 50;
END $$;