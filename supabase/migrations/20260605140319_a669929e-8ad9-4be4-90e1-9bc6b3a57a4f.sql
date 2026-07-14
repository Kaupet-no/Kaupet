
-- Add 'disabled' to listing_status enum
ALTER TYPE listing_status ADD VALUE IF NOT EXISTS 'disabled';

-- =========================================
-- Table: user_bans (permanent)
-- =========================================
CREATE TABLE public.user_bans (
  user_id uuid PRIMARY KEY,
  reason text NOT NULL,
  banned_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_bans TO authenticated;
GRANT ALL ON public.user_bans TO service_role;
ALTER TABLE public.user_bans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage user_bans"
  ON public.user_bans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users see own ban"
  ON public.user_bans FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- =========================================
-- Table: user_suspensions (timed)
-- =========================================
CREATE TABLE public.user_suspensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  reason text NOT NULL,
  suspended_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX user_suspensions_user_active_idx
  ON public.user_suspensions (user_id, expires_at);

GRANT SELECT ON public.user_suspensions TO authenticated;
GRANT ALL ON public.user_suspensions TO service_role;
ALTER TABLE public.user_suspensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage user_suspensions"
  ON public.user_suspensions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users see own suspensions"
  ON public.user_suspensions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- =========================================
-- Table: ip_bans
-- =========================================
CREATE TABLE public.ip_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address inet NOT NULL,
  reason text NOT NULL,
  banned_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);
CREATE UNIQUE INDEX ip_bans_ip_unique ON public.ip_bans (ip_address);

GRANT ALL ON public.ip_bans TO service_role;
ALTER TABLE public.ip_bans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage ip_bans"
  ON public.ip_bans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================
-- Table: admin_moderation_log
-- =========================================
CREATE TABLE public.admin_moderation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_moderation_log_created_idx ON public.admin_moderation_log (created_at DESC);

GRANT SELECT ON public.admin_moderation_log TO authenticated;
GRANT ALL ON public.admin_moderation_log TO service_role;
ALTER TABLE public.admin_moderation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read moderation log"
  ON public.admin_moderation_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =========================================
-- Helper functions
-- =========================================
CREATE OR REPLACE FUNCTION public.is_user_banned(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_bans WHERE user_id = _uid);
$$;

CREATE OR REPLACE FUNCTION public.is_user_suspended(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_suspensions
    WHERE user_id = _uid AND expires_at > now()
  );
$$;

-- =========================================
-- Enforcement triggers
-- =========================================
CREATE OR REPLACE FUNCTION public.listings_enforce_moderation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_user_banned(NEW.seller_id) THEN
    RAISE EXCEPTION 'Brukeren er utestengt og kan ikke opprette annonser'
      USING ERRCODE = 'check_violation';
  END IF;
  IF public.is_user_suspended(NEW.seller_id) THEN
    RAISE EXCEPTION 'Brukeren er svartelistet og kan ikke opprette annonser'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER listings_enforce_moderation_trg
  BEFORE INSERT ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.listings_enforce_moderation();

CREATE OR REPLACE FUNCTION public.conversations_enforce_moderation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_user_banned(NEW.buyer_id) OR public.is_user_suspended(NEW.buyer_id) THEN
    RAISE EXCEPTION 'Du kan ikke starte nye samtaler så lenge kontoen er sperret eller svartelistet'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER conversations_enforce_moderation_trg
  BEFORE INSERT ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.conversations_enforce_moderation();

CREATE OR REPLACE FUNCTION public.messages_enforce_moderation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_user_banned(NEW.sender_id) OR public.is_user_suspended(NEW.sender_id) THEN
    RAISE EXCEPTION 'Du kan ikke sende meldinger så lenge kontoen er sperret eller svartelistet'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER messages_enforce_moderation_trg
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messages_enforce_moderation();

-- =========================================
-- Admin RPCs
-- =========================================
CREATE OR REPLACE FUNCTION public.admin_disable_listing(_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.listings SET status = 'disabled' WHERE id = _id;
  INSERT INTO public.admin_moderation_log(admin_id, action, target_type, target_id, reason)
  VALUES (auth.uid(), 'disable_listing', 'listing', _id::text, _reason);
END $$;

CREATE OR REPLACE FUNCTION public.admin_enable_listing(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.listings SET status = 'active',
    published_at = COALESCE(published_at, now()),
    expires_at = now() + interval '30 days'
    WHERE id = _id AND status = 'disabled';
  INSERT INTO public.admin_moderation_log(admin_id, action, target_type, target_id)
  VALUES (auth.uid(), 'enable_listing', 'listing', _id::text);
END $$;

CREATE OR REPLACE FUNCTION public.admin_ban_user(_user_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF public.has_role(_user_id, 'admin') THEN
    RAISE EXCEPTION 'Kan ikke utestenge en administrator';
  END IF;
  INSERT INTO public.user_bans(user_id, reason, banned_by)
  VALUES (_user_id, _reason, auth.uid())
  ON CONFLICT (user_id) DO UPDATE SET reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by, created_at = now();
  UPDATE public.listings SET status = 'disabled'
    WHERE seller_id = _user_id AND status = 'active';
  INSERT INTO public.admin_moderation_log(admin_id, action, target_type, target_id, reason)
  VALUES (auth.uid(), 'ban_user', 'user', _user_id::text, _reason);
END $$;

CREATE OR REPLACE FUNCTION public.admin_unban_user(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM public.user_bans WHERE user_id = _user_id;
  INSERT INTO public.admin_moderation_log(admin_id, action, target_type, target_id)
  VALUES (auth.uid(), 'unban_user', 'user', _user_id::text);
END $$;

CREATE OR REPLACE FUNCTION public.admin_suspend_user(_user_id uuid, _reason text, _days int DEFAULT 30)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF public.has_role(_user_id, 'admin') THEN
    RAISE EXCEPTION 'Kan ikke svartelist en administrator';
  END IF;
  IF _days < 1 OR _days > 365 THEN
    RAISE EXCEPTION 'Varighet må være mellom 1 og 365 dager';
  END IF;
  INSERT INTO public.user_suspensions(user_id, reason, suspended_by, expires_at)
  VALUES (_user_id, _reason, auth.uid(), now() + (_days || ' days')::interval);
  UPDATE public.listings SET status = 'disabled'
    WHERE seller_id = _user_id AND status = 'active';
  INSERT INTO public.admin_moderation_log(admin_id, action, target_type, target_id, reason)
  VALUES (auth.uid(), 'suspend_user', 'user', _user_id::text, _reason);
END $$;

CREATE OR REPLACE FUNCTION public.admin_unsuspend_user(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.user_suspensions SET expires_at = now()
    WHERE user_id = _user_id AND expires_at > now();
  INSERT INTO public.admin_moderation_log(admin_id, action, target_type, target_id)
  VALUES (auth.uid(), 'unsuspend_user', 'user', _user_id::text);
END $$;

CREATE OR REPLACE FUNCTION public.admin_ban_ip(_ip inet, _reason text, _expires_at timestamptz DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  INSERT INTO public.ip_bans(ip_address, reason, banned_by, expires_at)
  VALUES (_ip, _reason, auth.uid(), _expires_at)
  ON CONFLICT (ip_address) DO UPDATE
    SET reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by,
        expires_at = EXCLUDED.expires_at, created_at = now()
  RETURNING id INTO _id;
  INSERT INTO public.admin_moderation_log(admin_id, action, target_type, target_id, reason)
  VALUES (auth.uid(), 'ban_ip', 'ip', _ip::text, _reason);
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_unban_ip(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ip inet;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM public.ip_bans WHERE id = _id RETURNING ip_address INTO _ip;
  INSERT INTO public.admin_moderation_log(admin_id, action, target_type, target_id)
  VALUES (auth.uid(), 'unban_ip', 'ip', COALESCE(_ip::text, _id::text));
END $$;

-- Status RPC for the current user
CREATE OR REPLACE FUNCTION public.my_moderation_status()
RETURNS TABLE(is_banned boolean, ban_reason text, is_suspended boolean, suspension_reason text, suspension_expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.user_bans WHERE user_id = auth.uid()),
    (SELECT reason FROM public.user_bans WHERE user_id = auth.uid()),
    EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = auth.uid() AND expires_at > now()),
    (SELECT reason FROM public.user_suspensions WHERE user_id = auth.uid() AND expires_at > now() ORDER BY expires_at DESC LIMIT 1),
    (SELECT expires_at FROM public.user_suspensions WHERE user_id = auth.uid() AND expires_at > now() ORDER BY expires_at DESC LIMIT 1)
$$;
