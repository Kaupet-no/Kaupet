-- Squashed baseline migration.
-- Consolidates all migrations up to and including 20260805100000
-- (183 files) into a single schema snapshot, generated via
-- `pg_dump --schema-only --schema=public` against a local Supabase
-- stack that had every migration applied in order, plus the
-- non-public-schema objects (extensions, cron job, storage buckets,
-- auth trigger) that migrations had created outside `public`.
--
-- Individual migration files prior to this one were removed from
-- supabase/migrations/ to keep the folder navigable. They remain
-- recorded as applied in supabase_migrations.schema_migrations on
-- staging/prod, so Supabase's GitHub deploy plugin will not attempt
-- to re-run them. This file is what a fresh environment (new local
-- dev stack, disaster recovery) replays to reach the same schema.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'user',
    'demo',
    'moderator'
);


--
-- Name: block_scope; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.block_scope AS ENUM (
    'all',
    'conversation'
);


--
-- Name: listing_condition; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.listing_condition AS ENUM (
    'new',
    'like_new',
    'good',
    'acceptable',
    'for_parts'
);


--
-- Name: listing_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.listing_status AS ENUM (
    'draft',
    'active',
    'sold',
    'archived',
    'expired',
    'disabled'
);


--
-- Name: promotion_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.promotion_status AS ENUM (
    'pending',
    'active',
    'expired',
    'failed',
    'refunded',
    'gifted'
);


--
-- Name: admin_approve_vehicle_brand(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_approve_vehicle_brand(_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.vehicle_brands SET status = 'approved' WHERE id = _id;
END $$;


--
-- Name: admin_approve_vehicle_model(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_approve_vehicle_model(_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.vehicle_models SET status = 'approved' WHERE id = _id;
END $$;


--
-- Name: admin_approve_vehicle_model_class(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_approve_vehicle_model_class(_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.vehicle_model_classes SET status = 'approved' WHERE id = _id;
END $$;


--
-- Name: admin_ban_ip(inet, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_ban_ip(_ip inet, _reason text, _expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: admin_ban_user(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_ban_user(_user_id uuid, _reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: vehicle_brands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicle_brands (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    category_group text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    submitted_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vehicle_brands_category_group_check CHECK ((category_group = ANY (ARRAY['bil'::text, 'motorsykkel'::text, 'moped_atv'::text, 'bobil_campingvogn'::text, 'henger'::text]))),
    CONSTRAINT vehicle_brands_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text])))
);


--
-- Name: admin_create_vehicle_brand(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_create_vehicle_brand(_name text, _category_group text) RETURNS public.vehicle_brands
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _row public.vehicle_brands;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  INSERT INTO public.vehicle_brands (name, category_group, status, submitted_by)
  VALUES (trim(_name), _category_group, 'approved', auth.uid())
  RETURNING * INTO _row;
  RETURN _row;
END $$;


--
-- Name: vehicle_models; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicle_models (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brand_id uuid NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    submitted_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    class_id uuid,
    CONSTRAINT vehicle_models_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text])))
);


--
-- Name: admin_create_vehicle_model(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_create_vehicle_model(_brand_id uuid, _name text) RETURNS public.vehicle_models
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _row public.vehicle_models;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  INSERT INTO public.vehicle_models (brand_id, name, status, submitted_by)
  VALUES (_brand_id, trim(_name), 'approved', auth.uid())
  RETURNING * INTO _row;
  RETURN _row;
END $$;


--
-- Name: admin_create_vehicle_model(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_create_vehicle_model(_brand_id uuid, _name text, _class_id uuid DEFAULT NULL::uuid) RETURNS public.vehicle_models
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _row public.vehicle_models;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  INSERT INTO public.vehicle_models (brand_id, class_id, name, status, submitted_by)
  VALUES (_brand_id, _class_id, trim(_name), 'approved', auth.uid())
  RETURNING * INTO _row;
  RETURN _row;
END $$;


--
-- Name: vehicle_model_classes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicle_model_classes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brand_id uuid NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    submitted_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vehicle_model_classes_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text])))
);


--
-- Name: admin_create_vehicle_model_class(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_create_vehicle_model_class(_brand_id uuid, _name text) RETURNS public.vehicle_model_classes
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _row public.vehicle_model_classes;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  INSERT INTO public.vehicle_model_classes (brand_id, name, status, submitted_by)
  VALUES (_brand_id, trim(_name), 'approved', auth.uid())
  RETURNING * INTO _row;
  RETURN _row;
END $$;


--
-- Name: admin_delete_listing(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_listing(_id uuid, _message text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: admin_delete_vehicle_brand(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_vehicle_brand(_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM public.vehicle_brands WHERE id = _id;
END $$;


--
-- Name: admin_delete_vehicle_model(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_vehicle_model(_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM public.vehicle_models WHERE id = _id;
END $$;


--
-- Name: admin_delete_vehicle_model_class(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_delete_vehicle_model_class(_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM public.vehicle_model_classes WHERE id = _id;
END $$;


--
-- Name: admin_disable_listing(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_disable_listing(_id uuid, _reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.listings SET status = 'disabled' WHERE id = _id;
  INSERT INTO public.admin_moderation_log(admin_id, action, target_type, target_id, reason)
  VALUES (auth.uid(), 'disable_listing', 'listing', _id::text, _reason);
END $$;


--
-- Name: admin_disable_listing_with_message(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_disable_listing_with_message(_id uuid, _reason text, _message text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: admin_enable_listing(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_enable_listing(_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: admin_export_user_data(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_export_user_data(_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _result jsonb;
  _email text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT email INTO _email FROM auth.users WHERE id = _user_id;

  _result := jsonb_build_object(
    'generated_at', now(),
    'generated_by_admin_id', auth.uid(),
    'user_id', _user_id,
    'auth', (
      SELECT jsonb_build_object(
        'email', u.email,
        'created_at', u.created_at,
        'last_sign_in_at', u.last_sign_in_at,
        'email_confirmed_at', u.email_confirmed_at
      )
      FROM auth.users u WHERE u.id = _user_id
    ),
    'profile', (
      SELECT to_jsonb(p) FROM public.profiles p WHERE p.id = _user_id
    ),
    'roles', COALESCE((
      SELECT jsonb_agg(to_jsonb(r)) FROM public.user_roles r WHERE r.user_id = _user_id
    ), '[]'::jsonb),
    'listings', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(l) || jsonb_build_object(
          'images', COALESCE((
            SELECT jsonb_agg(to_jsonb(i) ORDER BY i.sort_order)
            FROM public.listing_images i WHERE i.listing_id = l.id
          ), '[]'::jsonb)
        )
      )
      FROM public.listings l WHERE l.seller_id = _user_id
    ), '[]'::jsonb),
    'favorites', COALESCE((
      SELECT jsonb_agg(to_jsonb(f)) FROM public.favorites f WHERE f.user_id = _user_id
    ), '[]'::jsonb),
    'conversations', COALESCE((
      SELECT jsonb_agg(to_jsonb(c))
      FROM public.conversations c
      WHERE c.buyer_id = _user_id OR c.seller_id = _user_id
    ), '[]'::jsonb),
    'messages', COALESCE((
      SELECT jsonb_agg(to_jsonb(m))
      FROM public.messages m
      WHERE m.sender_id = _user_id
         OR m.conversation_id IN (
           SELECT c.id FROM public.conversations c
           WHERE c.buyer_id = _user_id OR c.seller_id = _user_id
         )
    ), '[]'::jsonb),
    'reviews_given', COALESCE((
      SELECT jsonb_agg(to_jsonb(r)) FROM public.user_reviews r WHERE r.reviewer_id = _user_id
    ), '[]'::jsonb),
    'reviews_received', COALESCE((
      SELECT jsonb_agg(to_jsonb(r)) FROM public.user_reviews r WHERE r.reviewee_id = _user_id
    ), '[]'::jsonb),
    'reports_submitted', COALESCE((
      SELECT jsonb_agg(to_jsonb(r)) FROM public.reports r WHERE r.reporter_id = _user_id
    ), '[]'::jsonb),
    'blocks', COALESCE((
      SELECT jsonb_agg(to_jsonb(b)) FROM public.user_blocks b WHERE b.blocker_id = _user_id
    ), '[]'::jsonb),
    'saved_searches', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(s) || jsonb_build_object(
          'notifications', COALESCE((
            SELECT jsonb_agg(to_jsonb(n))
            FROM public.saved_search_notifications n
            WHERE n.saved_search_id = s.id
          ), '[]'::jsonb)
        )
      )
      FROM public.saved_searches s WHERE s.user_id = _user_id
    ), '[]'::jsonb),
    'sales', COALESCE((
      SELECT jsonb_agg(to_jsonb(s))
      FROM public.listing_sales s
      WHERE s.buyer_id = _user_id OR s.seller_id = _user_id
    ), '[]'::jsonb),
    'notification_preferences', (
      SELECT to_jsonb(np) FROM public.notification_preferences np WHERE np.user_id = _user_id
    ),
    'push_subscriptions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ps.id,
        'endpoint', ps.endpoint,
        'user_agent', ps.user_agent,
        'created_at', ps.created_at,
        'last_used_at', ps.last_used_at
      ))
      FROM public.push_subscriptions ps WHERE ps.user_id = _user_id
    ), '[]'::jsonb),
    'moderation', jsonb_build_object(
      'bans', COALESCE((
        SELECT jsonb_agg(to_jsonb(b)) FROM public.user_bans b WHERE b.user_id = _user_id
      ), '[]'::jsonb),
      'suspensions', COALESCE((
        SELECT jsonb_agg(to_jsonb(s)) FROM public.user_suspensions s WHERE s.user_id = _user_id
      ), '[]'::jsonb),
      'admin_actions_against_user', COALESCE((
        SELECT jsonb_agg(to_jsonb(l))
        FROM public.admin_moderation_log l
        WHERE l.target_type = 'user' AND l.target_id = _user_id::text
      ), '[]'::jsonb)
    ),
    'account_deletion', (
      SELECT to_jsonb(ad) FROM public.account_deletions ad WHERE ad.user_id = _user_id
    ),
    'listing_view_counts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'listing_id', l.id,
        'title', l.title,
        'total_views', (SELECT count(*) FROM public.listing_view_events e WHERE e.listing_id = l.id)
      ))
      FROM public.listings l WHERE l.seller_id = _user_id
    ), '[]'::jsonb)
  );

  INSERT INTO public.admin_moderation_log(admin_id, action, target_type, target_id, reason)
  VALUES (auth.uid(), 'export_user_data', 'user', _user_id::text, COALESCE(_email, ''));

  RETURN _result;
END;
$$;


--
-- Name: admin_find_users_by_email(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_find_users_by_email(_query text) RETURNS TABLE(user_id uuid, email text, display_name text, created_at timestamp with time zone, is_admin boolean, is_demo boolean, is_moderator boolean)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: admin_grant_demo_role(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_grant_demo_role(_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, 'demo') ON CONFLICT DO NOTHING;
  INSERT INTO public.admin_moderation_log(admin_id, action, target_type, target_id)
  VALUES (auth.uid(), 'grant_demo_role', 'user', _user_id::text);
END $$;


--
-- Name: admin_grant_moderator_role(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_grant_moderator_role(_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  INSERT INTO public.user_roles(user_id, role) VALUES (_user_id, 'moderator') ON CONFLICT DO NOTHING;
END $$;


--
-- Name: admin_grant_role(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_grant_role(_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: admin_list_bans(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_bans() RETURNS TABLE(user_id uuid, display_name text, reason text, banned_by uuid, created_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: admin_list_error_log(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_error_log(_limit integer DEFAULT 100) RETURNS TABLE(id uuid, function_name text, error_message text, error_code text, context jsonb, user_id uuid, created_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
  SELECT e.id, e.function_name, e.error_message, e.error_code, e.context, e.user_id, e.created_at
  FROM public.error_log e
  ORDER BY e.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 500));
END $$;


--
-- Name: admin_list_ip_bans(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_ip_bans() RETURNS TABLE(id uuid, ip_address inet, reason text, banned_by uuid, created_at timestamp with time zone, expires_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: admin_list_moderation_log(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_moderation_log(_limit integer DEFAULT 100) RETURNS TABLE(id uuid, admin_id uuid, admin_name text, action text, target_type text, target_id text, reason text, created_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: admin_list_pending_vehicle_entries(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_pending_vehicle_entries() RETURNS TABLE(kind text, id uuid, name text, category_group text, brand_name text, submitted_by uuid, submitted_by_name text, created_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
    SELECT 'brand'::text, b.id, b.name, b.category_group, NULL::text,
      b.submitted_by, p.display_name, b.created_at
    FROM public.vehicle_brands b
    LEFT JOIN public.profiles p ON p.id = b.submitted_by
    WHERE b.status = 'pending'
    UNION ALL
    SELECT 'model'::text, m.id, m.name, br.category_group, br.name,
      m.submitted_by, p.display_name, m.created_at
    FROM public.vehicle_models m
    JOIN public.vehicle_brands br ON br.id = m.brand_id
    LEFT JOIN public.profiles p ON p.id = m.submitted_by
    WHERE m.status = 'pending'
    UNION ALL
    SELECT 'class'::text, mc.id, mc.name, br.category_group, br.name,
      mc.submitted_by, p.display_name, mc.created_at
    FROM public.vehicle_model_classes mc
    JOIN public.vehicle_brands br ON br.id = mc.brand_id
    LEFT JOIN public.profiles p ON p.id = mc.submitted_by
    WHERE mc.status = 'pending'
    ORDER BY created_at DESC;
END $$;


--
-- Name: admin_list_reports(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_reports(_limit integer DEFAULT 100) RETURNS TABLE(id uuid, created_at timestamp with time zone, listing_id uuid, kaupet_code text, listing_title text, reporter_id uuid, reporter_name text, owner_id uuid, owner_name text, reported_user_id uuid, reported_user_name text, reason text, comment text, status text, resolved_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: admin_list_suspensions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_suspensions() RETURNS TABLE(id uuid, user_id uuid, display_name text, reason text, suspended_by uuid, created_at timestamp with time zone, expires_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: admin_list_vehicle_brands_with_models(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_vehicle_brands_with_models() RETURNS TABLE(brand_id uuid, brand_name text, category_group text, model_id uuid, model_name text, class_id uuid, class_name text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
    SELECT b.id, b.name, b.category_group, m.id, m.name, mc.id, mc.name
    FROM public.vehicle_brands b
    LEFT JOIN public.vehicle_models m ON m.brand_id = b.id AND m.status = 'approved'
    LEFT JOIN public.vehicle_model_classes mc ON mc.id = m.class_id AND mc.status = 'approved'
    WHERE b.status = 'approved'
    ORDER BY b.category_group, b.name, mc.name NULLS FIRST, m.name;
END $$;


--
-- Name: admin_overview_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_overview_stats() RETURNS TABLE(views_7d bigint, views_30d bigint, new_users_30d bigint, active_listings bigint, total_listings bigint, conversations_total bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY SELECT
    (SELECT count(*) FROM public.listing_view_events WHERE created_at > now() - interval '7 days'),
    (SELECT count(*) FROM public.listing_view_events WHERE created_at > now() - interval '30 days'),
    (SELECT count(*) FROM public.profiles WHERE created_at > now() - interval '30 days'),
    (SELECT count(*) FROM public.listings WHERE status = 'active'),
    (SELECT count(*) FROM public.listings),
    (SELECT count(*) FROM public.conversations);
END;
$$;


--
-- Name: admin_popular_categories(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_popular_categories() RETURNS TABLE(id uuid, name_nb text, slug text, listing_count bigint, view_count bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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
    (SELECT count(*) FROM public.listing_view_events e
       JOIN public.listings l ON l.id = e.listing_id
       WHERE l.category_id = c.id) AS view_count
  FROM public.categories c
  ORDER BY listing_count DESC, view_count DESC;
END;
$$;


--
-- Name: admin_popular_listings(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_popular_listings(_limit integer DEFAULT 10) RETURNS TABLE(id uuid, title text, status public.listing_status, view_count bigint, favorite_count bigint, created_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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
    (SELECT count(*) FROM public.listing_view_events e WHERE e.listing_id = l.id) AS view_count,
    (SELECT count(*) FROM public.favorites f WHERE f.listing_id = l.id) AS favorite_count,
    l.created_at
  FROM public.listings l
  ORDER BY view_count DESC, favorite_count DESC
  LIMIT _limit;
END;
$$;


--
-- Name: admin_reject_vehicle_brand(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_reject_vehicle_brand(_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM public.vehicle_brands WHERE id = _id AND status = 'pending';
END $$;


--
-- Name: admin_reject_vehicle_model(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_reject_vehicle_model(_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM public.vehicle_models WHERE id = _id AND status = 'pending';
END $$;


--
-- Name: admin_reject_vehicle_model_class(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_reject_vehicle_model_class(_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM public.vehicle_model_classes WHERE id = _id AND status = 'pending';
END $$;


--
-- Name: admin_resolve_report(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_resolve_report(_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: admin_revoke_demo_role(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_revoke_demo_role(_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id AND role = 'demo';
  INSERT INTO public.admin_moderation_log(admin_id, action, target_type, target_id)
  VALUES (auth.uid(), 'revoke_demo_role', 'user', _user_id::text);
END $$;


--
-- Name: admin_revoke_moderator_role(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_revoke_moderator_role(_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id AND role = 'moderator';
END $$;


--
-- Name: admin_revoke_role(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_revoke_role(_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: admin_search_listings(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_search_listings(_query text DEFAULT ''::text, _status text DEFAULT NULL::text, _limit integer DEFAULT 50) RETURNS TABLE(id uuid, kaupet_code character, title text, status public.listing_status, seller_id uuid, seller_name text, created_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN QUERY
  SELECT l.id, l.kaupet_code, l.title, l.status, l.seller_id, p.display_name, l.created_at
  FROM public.listings l
  LEFT JOIN public.profiles p ON p.id = l.seller_id
  WHERE (_query = '' OR l.title ILIKE '%' || _query || '%' OR l.kaupet_code = _query)
    AND (_status IS NULL OR l.status::text = _status)
  ORDER BY l.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 200));
END $$;


--
-- Name: admin_suspend_user(uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_suspend_user(_user_id uuid, _reason text, _days integer DEFAULT 30) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: admin_unban_ip(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_unban_ip(_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE _ip inet;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM public.ip_bans WHERE id = _id RETURNING ip_address INTO _ip;
  INSERT INTO public.admin_moderation_log(admin_id, action, target_type, target_id)
  VALUES (auth.uid(), 'unban_ip', 'ip', COALESCE(_ip::text, _id::text));
END $$;


--
-- Name: admin_unban_user(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_unban_user(_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM public.user_bans WHERE user_id = _user_id;
  INSERT INTO public.admin_moderation_log(admin_id, action, target_type, target_id)
  VALUES (auth.uid(), 'unban_user', 'user', _user_id::text);
END $$;


--
-- Name: admin_unsuspend_user(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_unsuspend_user(_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.user_suspensions SET expires_at = now()
    WHERE user_id = _user_id AND expires_at > now();
  INSERT INTO public.admin_moderation_log(admin_id, action, target_type, target_id)
  VALUES (auth.uid(), 'unsuspend_user', 'user', _user_id::text);
END $$;


--
-- Name: admin_update_vehicle_brand(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_update_vehicle_brand(_id uuid, _name text) RETURNS public.vehicle_brands
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _row public.vehicle_brands;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.vehicle_brands SET name = trim(_name) WHERE id = _id
  RETURNING * INTO _row;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Fant ikke merket';
  END IF;
  RETURN _row;
END $$;


--
-- Name: admin_update_vehicle_model(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_update_vehicle_model(_id uuid, _name text) RETURNS public.vehicle_models
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _row public.vehicle_models;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.vehicle_models SET name = trim(_name) WHERE id = _id
  RETURNING * INTO _row;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Fant ikke modellen';
  END IF;
  RETURN _row;
END $$;


--
-- Name: admin_update_vehicle_model(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_update_vehicle_model(_id uuid, _name text, _class_id uuid DEFAULT NULL::uuid) RETURNS public.vehicle_models
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _row public.vehicle_models;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.vehicle_models SET name = trim(_name), class_id = _class_id WHERE id = _id
  RETURNING * INTO _row;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Fant ikke modellen';
  END IF;
  RETURN _row;
END $$;


--
-- Name: admin_update_vehicle_model_class(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_update_vehicle_model_class(_id uuid, _name text) RETURNS public.vehicle_model_classes
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _row public.vehicle_model_classes;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.vehicle_model_classes SET name = trim(_name) WHERE id = _id
  RETURNING * INTO _row;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Fant ikke klassen';
  END IF;
  RETURN _row;
END $$;


--
-- Name: admin_views_timeseries(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_views_timeseries(_days integer DEFAULT 30) RETURNS TABLE(day date, views bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT d::date AS day,
    (SELECT count(*) FROM public.listing_view_events e WHERE e.created_at::date = d::date) AS views
  FROM generate_series(
    (now() - (_days || ' days')::interval)::date,
    now()::date,
    interval '1 day'
  ) d;
END;
$$;


--
-- Name: admin_zero_result_searches(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_zero_result_searches(_limit integer DEFAULT 50) RETURNS TABLE(query text, search_count integer, zero_result_count integer, last_searched_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    s.query,
    s.search_count,
    s.zero_result_count,
    s.last_searched_at
  FROM public.search_query_stats s
  WHERE s.zero_result_count > 0
  ORDER BY s.zero_result_count DESC, s.last_searched_at DESC
  LIMIT _limit;
END;
$$;


--
-- Name: cancel_account_deletion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_account_deletion() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _uid uuid := auth.uid();
  _existed boolean;
BEGIN
  IF _uid IS NULL THEN
    RETURN false;
  END IF;
  DELETE FROM public.account_deletions WHERE user_id = _uid
  RETURNING true INTO _existed;
  RETURN COALESCE(_existed, false);
END;
$$;


--
-- Name: conversations_enforce_block(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.conversations_enforce_block() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.user_blocks b
    WHERE b.scope = 'all'
      AND (
        (b.blocker_id = NEW.buyer_id AND b.blocked_id = NEW.seller_id)
        OR (b.blocker_id = NEW.seller_id AND b.blocked_id = NEW.buyer_id)
      )
  ) THEN
    RAISE EXCEPTION 'Samtalen kan ikke opprettes fordi en av brukerne har blokkert den andre'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: conversations_enforce_moderation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.conversations_enforce_moderation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF public.is_user_banned(NEW.buyer_id) OR public.is_user_suspended(NEW.buyer_id) THEN
    RAISE EXCEPTION 'Du kan ikke starte nye samtaler så lenge kontoen er sperret eller svartelistet'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: demo_activate_promotion(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.demo_activate_promotion(_listing_id uuid, _duration_days integer) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: dispatch_push_for_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dispatch_push_for_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _url text := COALESCE(
    (SELECT value FROM public.app_settings WHERE key = 'push_dispatch_url'),
    'https://kaupet.no/api/public/push/dispatch'
  );
  _secret text := (SELECT value FROM public.app_settings WHERE key = 'push_dispatch_secret');
BEGIN
  PERFORM net.http_post(
    url := _url,
    headers := jsonb_build_object('Content-Type', 'application/json') ||
      CASE WHEN _secret IS NOT NULL THEN jsonb_build_object('X-Push-Dispatch-Secret', _secret) ELSE '{}'::jsonb END,
    body := jsonb_build_object('type', 'message', 'message_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.push_dispatch_failures (kind, payload, error)
  VALUES ('message', jsonb_build_object('message_id', NEW.id), SQLERRM);
  RETURN NEW;
END;
$$;


--
-- Name: dispatch_push_for_price_drop(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dispatch_push_for_price_drop() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _url text := COALESCE(
    (SELECT value FROM public.app_settings WHERE key = 'push_dispatch_url'),
    'https://kaupet.no/api/public/push/dispatch'
  );
  _secret text := (SELECT value FROM public.app_settings WHERE key = 'push_dispatch_secret');
BEGIN
  PERFORM net.http_post(
    url := _url,
    headers := jsonb_build_object('Content-Type', 'application/json') ||
      CASE WHEN _secret IS NOT NULL THEN jsonb_build_object('X-Push-Dispatch-Secret', _secret) ELSE '{}'::jsonb END,
    body := jsonb_build_object('type', 'price_drop', 'price_drop_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.push_dispatch_failures (kind, payload, error)
  VALUES ('price_drop', jsonb_build_object('price_drop_id', NEW.id), SQLERRM);
  RETURN NEW;
END;
$$;


--
-- Name: dispatch_push_for_saved_search(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dispatch_push_for_saved_search() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _url text := COALESCE(
    (SELECT value FROM public.app_settings WHERE key = 'push_dispatch_url'),
    'https://kaupet.no/api/public/push/dispatch'
  );
  _secret text := (SELECT value FROM public.app_settings WHERE key = 'push_dispatch_secret');
BEGIN
  PERFORM net.http_post(
    url := _url,
    headers := jsonb_build_object('Content-Type', 'application/json') ||
      CASE WHEN _secret IS NOT NULL THEN jsonb_build_object('X-Push-Dispatch-Secret', _secret) ELSE '{}'::jsonb END,
    body := jsonb_build_object('type', 'saved_search', 'notification_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.push_dispatch_failures (kind, payload, error)
  VALUES ('saved_search', jsonb_build_object('notification_id', NEW.id), SQLERRM);
  RETURN NEW;
END;
$$;


--
-- Name: dispatch_push_for_sold(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dispatch_push_for_sold() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _url text := COALESCE(
    (SELECT value FROM public.app_settings WHERE key = 'push_dispatch_url'),
    'https://kaupet.no/api/public/push/dispatch'
  );
  _secret text := (SELECT value FROM public.app_settings WHERE key = 'push_dispatch_secret');
BEGIN
  PERFORM net.http_post(
    url := _url,
    headers := jsonb_build_object('Content-Type', 'application/json') ||
      CASE WHEN _secret IS NOT NULL THEN jsonb_build_object('X-Push-Dispatch-Secret', _secret) ELSE '{}'::jsonb END,
    body := jsonb_build_object('type', 'sold', 'sold_notification_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.push_dispatch_failures (kind, payload, error)
  VALUES ('sold', jsonb_build_object('sold_notification_id', NEW.id), SQLERRM);
  RETURN NEW;
END;
$$;


--
-- Name: enforce_conversation_read_status_only(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_conversation_read_status_only() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.listing_id IS DISTINCT FROM OLD.listing_id
    OR NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
    OR NEW.seller_id IS DISTINCT FROM OLD.seller_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Only last_message_at/buyer_last_read_at/seller_last_read_at may be updated by participants';
  END IF;
  IF auth.uid() = OLD.buyer_id AND NEW.seller_last_read_at IS DISTINCT FROM OLD.seller_last_read_at THEN
    RAISE EXCEPTION 'Buyer cannot update seller_last_read_at';
  END IF;
  IF auth.uid() = OLD.seller_id AND NEW.buyer_last_read_at IS DISTINCT FROM OLD.buyer_last_read_at THEN
    RAISE EXCEPTION 'Seller cannot update buyer_last_read_at';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: enforce_message_soft_delete_only(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_message_soft_delete_only() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
    OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
    OR NEW.body IS DISTINCT FROM OLD.body
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Only deleted_at may be updated on messages';
  END IF;
  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'deleted_at cannot be changed once set';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: expire_listing_promotions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expire_listing_promotions() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE _count int;
BEGIN
  WITH updated AS (
    UPDATE public.listing_promotions
       SET status = 'expired'
     WHERE status IN ('active','gifted')
       AND expires_at IS NOT NULL
       AND expires_at <= now()
    RETURNING 1
  )
  SELECT count(*) INTO _count FROM updated;
  RETURN _count;
END $$;


--
-- Name: expire_old_listings(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expire_old_listings() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _count integer;
BEGIN
  WITH updated AS (
    UPDATE public.listings
    SET status = 'expired'
    WHERE status = 'active'
      AND expires_at IS NOT NULL
      AND expires_at <= now()
    RETURNING 1
  )
  SELECT count(*) INTO _count FROM updated;
  RETURN _count;
END;
$$;


--
-- Name: fuzz_listing_location(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fuzz_listing_location() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  _cell_lat constant double precision := 400.0 / 111320.0;
  _cell_lng double precision;
BEGIN
  IF NEW.lat IS NULL OR NEW.lng IS NULL THEN
    NEW.display_lat := NULL;
    NEW.display_lng := NULL;
    RETURN NEW;
  END IF;
  _cell_lng := 400.0 / (111320.0 * GREATEST(cos(radians(NEW.lat)), 0.01));
  NEW.display_lat := round(NEW.lat / _cell_lat) * _cell_lat;
  NEW.display_lng := round(NEW.lng / _cell_lng) * _cell_lng;
  RETURN NEW;
END;
$$;


--
-- Name: generate_kaupet_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_kaupet_code() RETURNS character
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _code char(8);
  _attempt int := 0;
BEGIN
  LOOP
    _attempt := _attempt + 1;
    -- 8 random digits, zero-padded
    _code := lpad(((random() * 100000000)::bigint % 100000000)::text, 8, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.listings WHERE kaupet_code = _code);
    IF _attempt > 20 THEN
      RAISE EXCEPTION 'Kunne ikke generere unik Kaupet-kode etter 20 forsøk';
    END IF;
  END LOOP;
  RETURN _code;
END;
$$;


--
-- Name: get_featured_listing_ids(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_featured_listing_ids(_category_slug text DEFAULT NULL::text, _limit integer DEFAULT 2) RETURNS TABLE(listing_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT p.listing_id
    FROM public.listing_promotions p
    JOIN public.listings l ON l.id = p.listing_id
    LEFT JOIN public.categories c ON c.id = l.category_id
   WHERE p.status IN ('active','gifted')
     AND p.expires_at > now()
     AND l.status = 'active'
     AND (_category_slug IS NULL OR c.slug = _category_slug)
   ORDER BY random()
   LIMIT GREATEST(1, LEAST(_limit, 10));
$$;


--
-- Name: get_listing_owner_location(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_listing_owner_location(_listing_id uuid) RETURNS TABLE(lat double precision, lng double precision)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT l.lat, l.lng
  FROM public.listings l
  WHERE l.id = _listing_id AND l.seller_id = auth.uid();
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;


--
-- Name: is_blocked_between(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_blocked_between(_a uuid, _b uuid, _conversation_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks b
    WHERE
      (
        (b.blocker_id = _a AND b.blocked_id = _b)
        OR (b.blocker_id = _b AND b.blocked_id = _a)
      )
      AND (
        b.scope = 'all'
        OR (b.scope = 'conversation' AND b.conversation_id = _conversation_id)
      )
  );
$$;


--
-- Name: is_ip_banned(inet); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_ip_banned(_ip inet) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ip_bans
    WHERE ip_address = _ip AND (expires_at IS NULL OR expires_at > now())
  );
$$;


--
-- Name: is_user_banned(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_user_banned(_uid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_bans WHERE user_id = _uid);
$$;


--
-- Name: is_user_deletion_pending(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_user_deletion_pending(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.account_deletions WHERE user_id = _user_id);
$$;


--
-- Name: is_user_suspended(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_user_suspended(_uid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_suspensions
    WHERE user_id = _uid AND expires_at > now()
  );
$$;


--
-- Name: listing_sales_sync_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.listing_sales_sync_status() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.listings SET status = 'sold' WHERE id = NEW.listing_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Don't auto-reactivate if seller has changed status manually since
    UPDATE public.listings SET status = 'active'
      WHERE id = OLD.listing_id AND status = 'sold';
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: listing_sales_validate(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.listing_sales_validate() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _conv record;
  _listing_seller uuid;
BEGIN
  SELECT seller_id, buyer_id, listing_id INTO _conv
  FROM public.conversations WHERE id = NEW.conversation_id;
  IF _conv IS NULL THEN
    RAISE EXCEPTION 'Samtalen finnes ikke';
  END IF;
  IF _conv.listing_id <> NEW.listing_id THEN
    RAISE EXCEPTION 'Samtalen tilhører ikke denne annonsen';
  END IF;
  IF _conv.seller_id <> NEW.seller_id OR _conv.buyer_id <> NEW.buyer_id THEN
    RAISE EXCEPTION 'Selger eller kjøper stemmer ikke med samtalen';
  END IF;

  SELECT seller_id INTO _listing_seller FROM public.listings WHERE id = NEW.listing_id;
  IF _listing_seller IS NULL OR _listing_seller <> NEW.seller_id THEN
    RAISE EXCEPTION 'Selger eier ikke annonsen';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: listing_stats(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.listing_stats(_listing_id uuid) RETURNS TABLE(total_views bigint, unique_visitors bigint, favorite_count bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.listings l
    WHERE l.id = _listing_id AND l.seller_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*) FROM public.listing_view_events e WHERE e.listing_id = _listing_id),
    (SELECT count(*) FROM public.listing_views v WHERE v.listing_id = _listing_id),
    (SELECT count(*) FROM public.favorites f WHERE f.listing_id = _listing_id);
END;
$$;


--
-- Name: listings_assign_kaupet_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.listings_assign_kaupet_code() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.kaupet_code IS NULL THEN
    NEW.kaupet_code := public.generate_kaupet_code();
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: listings_emit_price_drops(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.listings_emit_price_drops() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _pct numeric(5,2);
BEGIN
  IF NEW.price_nok IS NULL OR OLD.price_nok IS NULL THEN RETURN NEW; END IF;
  IF NEW.price_nok >= OLD.price_nok THEN RETURN NEW; END IF;
  IF OLD.price_nok <= 0 THEN RETURN NEW; END IF;
  IF NEW.is_free THEN RETURN NEW; END IF;
  IF NEW.status <> 'active' THEN RETURN NEW; END IF;

  _pct := ROUND(((OLD.price_nok - NEW.price_nok) * 100.0 / OLD.price_nok)::numeric, 2);
  IF _pct <= 5 THEN RETURN NEW; END IF;

  INSERT INTO public.favorite_price_drops
    (user_id, listing_id, old_price_nok, new_price_nok, drop_pct)
  SELECT f.user_id, NEW.id, OLD.price_nok, NEW.price_nok, _pct
  FROM public.favorites f
  WHERE f.listing_id = NEW.id
    AND f.user_id <> NEW.seller_id
  ON CONFLICT (user_id, listing_id, old_price_nok) DO NOTHING;

  RETURN NEW;
END;
$$;


--
-- Name: listings_emit_sold_notifications(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.listings_emit_sold_notifications() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF OLD.status = 'sold' OR NEW.status <> 'sold' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.favorite_sold_notifications (user_id, listing_id)
  SELECT f.user_id, NEW.id
  FROM public.favorites f
  WHERE f.listing_id = NEW.id AND f.user_id <> NEW.seller_id
  ON CONFLICT (user_id, listing_id) DO NOTHING;

  RETURN NEW;
END;
$$;


--
-- Name: listings_enforce_moderation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.listings_enforce_moderation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: listings_expire_promotions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.listings_expire_promotions() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status <> 'active' AND OLD.status = 'active' THEN
    UPDATE public.listing_promotions
       SET status = 'expired'
     WHERE listing_id = NEW.id AND status IN ('active','gifted');
  END IF;
  RETURN NEW;
END $$;


--
-- Name: listings_match_saved_searches_trigger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.listings_match_saved_searches_trigger() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status = 'active' AND (
    TG_OP = 'INSERT'
    OR OLD.status IS DISTINCT FROM NEW.status
    OR OLD.price_nok IS DISTINCT FROM NEW.price_nok
    OR OLD.is_free IS DISTINCT FROM NEW.is_free
    OR OLD.category_id IS DISTINCT FROM NEW.category_id
    OR OLD.condition IS DISTINCT FROM NEW.condition
  ) THEN
    PERFORM public.match_listing_to_saved_searches(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: listings_remove_category_word_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.listings_remove_category_word_stats() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF OLD.counted_category_id IS NOT NULL AND OLD.counted_lexemes IS NOT NULL THEN
    UPDATE public.listing_category_word_stats s
    SET listing_count = GREATEST(listing_count - 1, 0),
        updated_at = now()
    FROM unnest(OLD.counted_lexemes) AS lex(lexeme)
    WHERE s.lexeme = lex.lexeme AND s.category_id = OLD.counted_category_id;
  END IF;
  RETURN OLD;
END;
$$;


--
-- Name: listings_remove_keyword_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.listings_remove_keyword_stats() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF OLD.counted_keyword_category_id IS NOT NULL AND OLD.counted_keywords IS NOT NULL THEN
    UPDATE public.listing_keyword_stats s
    SET listing_count = GREATEST(listing_count - 1, 0)
    FROM unnest(OLD.counted_keywords) AS w(word)
    WHERE s.word = w.word AND s.category_id = OLD.counted_keyword_category_id;
  END IF;
  RETURN OLD;
END;
$$;


--
-- Name: listings_search_term_match(tsvector, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.listings_search_term_match(search_vector tsvector, title text, term text) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT search_vector @@ websearch_to_tsquery('norwegian', term)
    OR similarity(title, term) > 0.25
$$;


--
-- Name: listings_search_vector_trigger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.listings_search_vector_trigger() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  body_type_hint text;
BEGIN
  BEGIN
    body_type_hint := (NEW.attributes->>'vehicle_lookup')::jsonb ->> 'body_type_hint';
  EXCEPTION WHEN OTHERS THEN
    body_type_hint := NULL;
  END;

  NEW.search_vector :=
    setweight(to_tsvector('norwegian', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('norwegian', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('norwegian', coalesce(NEW.city, '')), 'C') ||
    setweight(to_tsvector('norwegian', coalesce(body_type_hint, '')), 'C');
  RETURN NEW;
END;
$$;


--
-- Name: listings_set_expiry(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.listings_set_expiry() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status = 'active' THEN
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active' THEN
      NEW.published_at := now();
      NEW.expires_at := now() + interval '30 days';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: listings_update_category_word_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.listings_update_category_word_stats() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _new_lexemes TEXT[];
BEGIN
  -- Decrement the previous contribution of this listing, if any.
  IF OLD.counted_category_id IS NOT NULL AND OLD.counted_lexemes IS NOT NULL THEN
    UPDATE public.listing_category_word_stats s
    SET listing_count = GREATEST(listing_count - 1, 0),
        updated_at = now()
    FROM unnest(OLD.counted_lexemes) AS lex(lexeme)
    WHERE s.lexeme = lex.lexeme AND s.category_id = OLD.counted_category_id;
  END IF;

  -- Only (re)count when the listing is currently active and has a category.
  IF NEW.status = 'active' AND NEW.category_id IS NOT NULL THEN
    SELECT array_agg(DISTINCT word) INTO _new_lexemes
    FROM ts_stat(format('SELECT to_tsvector(''norwegian'', %L)', coalesce(NEW.title, '')));

    IF _new_lexemes IS NOT NULL THEN
      INSERT INTO public.listing_category_word_stats (lexeme, category_id, listing_count)
      SELECT lex, NEW.category_id, 1
      FROM unnest(_new_lexemes) AS lex
      ON CONFLICT (lexeme, category_id)
      DO UPDATE SET listing_count = listing_category_word_stats.listing_count + 1,
                     updated_at = now();
    END IF;

    NEW.counted_category_id := NEW.category_id;
    NEW.counted_lexemes := _new_lexemes;
  ELSE
    NEW.counted_category_id := NULL;
    NEW.counted_lexemes := NULL;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: listings_update_keyword_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.listings_update_keyword_stats() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _stopwords TEXT[] := ARRAY[
    'og','er','en','et','ei','i','på','med','til','av','for','som','fra',
    'har','den','det','de','vi','du','kan','ikke','seg','han','hun','men',
    'om','så','ut','enn','da','når','at','dem','sin','hva','ved','var',
    'nye','ny','god','lite','litt','stor','selger','selges','kjøper',
    'kjøpes','pris','brukt','gammel','denne','dette','disse','alle',
    'her','der','inn','ute','også','bare','men','etter','over','under',
    'mot','uten','hos','deg','meg','oss','dere','hun','ham','ett','two',
    'tre','fire','fem','seks','sju','åtte','ni','ti'
  ];
  _new_words TEXT[];
BEGIN
  -- Decrement previous contribution of this listing, if any.
  IF OLD.counted_keyword_category_id IS NOT NULL AND OLD.counted_keywords IS NOT NULL THEN
    UPDATE public.listing_keyword_stats s
    SET listing_count = GREATEST(listing_count - 1, 0)
    FROM unnest(OLD.counted_keywords) AS w(word)
    WHERE s.word = w.word AND s.category_id = OLD.counted_keyword_category_id;
  END IF;

  -- Only (re)count when the listing is active and has a category.
  IF NEW.status = 'active' AND NEW.category_id IS NOT NULL THEN
    SELECT array_agg(DISTINCT w)
    INTO _new_words
    FROM (
      SELECT regexp_split_to_table(
        lower(regexp_replace(coalesce(NEW.title, ''), '[^a-zæøåA-ZÆØÅ0-9\s]', '', 'g')),
        '\s+'
      ) AS w
    ) sub
    WHERE length(w) >= 3
      AND w NOT IN (SELECT unnest(_stopwords));

    IF _new_words IS NOT NULL THEN
      INSERT INTO public.listing_keyword_stats (word, category_id, listing_count)
      SELECT w, NEW.category_id, 1
      FROM unnest(_new_words) AS w
      ON CONFLICT (word, category_id)
      DO UPDATE SET listing_count = listing_keyword_stats.listing_count + 1;
    END IF;

    NEW.counted_keyword_category_id := NEW.category_id;
    NEW.counted_keywords := _new_words;
  ELSE
    NEW.counted_keyword_category_id := NULL;
    NEW.counted_keywords := NULL;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: listings_within_radius(double precision, double precision, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.listings_within_radius(center_lat double precision, center_lng double precision, radius_km double precision) RETURNS TABLE(id uuid, distance_km double precision)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    l.id,
    (
      6371 * acos(
        LEAST(1.0, GREATEST(-1.0,
          cos(radians(center_lat)) * cos(radians(l.lat)) *
          cos(radians(l.lng) - radians(center_lng)) +
          sin(radians(center_lat)) * sin(radians(l.lat))
        ))
      )
    ) AS distance_km
  FROM public.listings l
  WHERE l.lat IS NOT NULL
    AND l.lng IS NOT NULL
    AND l.status = 'active'
    AND (
      6371 * acos(
        LEAST(1.0, GREATEST(-1.0,
          cos(radians(center_lat)) * cos(radians(l.lat)) *
          cos(radians(l.lng) - radians(center_lng)) +
          sin(radians(center_lat)) * sin(radians(l.lat))
        ))
      )
    ) <= radius_km;
$$;


--
-- Name: log_listing_view(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_listing_view(_listing_id uuid, _visitor_key text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF _visitor_key IS NULL OR length(trim(_visitor_key)) = 0 THEN
    RAISE EXCEPTION 'visitor_key er påkrevd';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.listings l WHERE l.id = _listing_id AND l.status = 'active'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.listing_views (listing_id, visitor_key, user_id)
  VALUES (_listing_id, _visitor_key, auth.uid())
  ON CONFLICT (listing_id, visitor_key) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM public.listing_view_events e
    WHERE e.listing_id = _listing_id
      AND e.visitor_key = _visitor_key
      AND e.created_at > now() - interval '30 minutes'
  ) THEN
    INSERT INTO public.listing_view_events (listing_id, visitor_key, user_id)
    VALUES (_listing_id, _visitor_key, auth.uid());
  END IF;
END;
$$;


--
-- Name: log_search_query(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_search_query(_query text, _result_count integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  normalized TEXT := trim(lower(_query));
BEGIN
  IF normalized = '' THEN
    RETURN;
  END IF;

  INSERT INTO public.search_query_stats (query, search_count, zero_result_count, last_searched_at)
  VALUES (normalized, 1, CASE WHEN _result_count = 0 THEN 1 ELSE 0 END, now())
  ON CONFLICT (query) DO UPDATE SET
    search_count = search_query_stats.search_count + 1,
    zero_result_count = search_query_stats.zero_result_count
      + CASE WHEN _result_count = 0 THEN 1 ELSE 0 END,
    last_searched_at = now();
END;
$$;


--
-- Name: match_listing_to_saved_searches(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_listing_to_saved_searches(_listing_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  l RECORD;
  s RECORD;
  c jsonb;
  cats jsonb;
  conds jsonb;
  terms jsonb;
  q_mode text;
  cat_mode text;
  min_price int;
  max_price int;
  include_free boolean;
  center_lat double precision;
  center_lng double precision;
  radius_km double precision;
  dist double precision;
  cat_slug text;
  cat_ids uuid[];
  match_count int;
  term text;
  pattern text;
  term_matches boolean;
  all_match boolean;
  any_match boolean;
BEGIN
  SELECT l2.*, cc.slug AS cat_slug
  INTO l
  FROM public.listings l2
  LEFT JOIN public.categories cc ON cc.id = l2.category_id
  WHERE l2.id = _listing_id AND l2.status = 'active';

  IF NOT FOUND THEN RETURN; END IF;

  FOR s IN
    SELECT * FROM public.saved_searches WHERE notify = true
  LOOP
    c := s.criteria;

    -- Categories
    cats := COALESCE(c->'categories', '[]'::jsonb);
    cat_mode := COALESCE(c->>'catMode', 'any');
    IF jsonb_array_length(cats) > 0 THEN
      IF l.cat_slug IS NULL THEN CONTINUE; END IF;
      -- listing has one category; "any" requires slug in list, "all" with 2+ slugs cannot match
      IF cat_mode = 'all' AND jsonb_array_length(cats) > 1 THEN CONTINUE; END IF;
      IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(cats) x WHERE x.value = l.cat_slug) THEN
        CONTINUE;
      END IF;
    END IF;

    -- Conditions
    conds := COALESCE(c->'conditions', '[]'::jsonb);
    IF jsonb_array_length(conds) > 0 THEN
      IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(conds) x WHERE x.value = l.condition::text) THEN
        CONTINUE;
      END IF;
    END IF;

    -- Price
    min_price := NULLIF(c->>'min','')::int;
    max_price := NULLIF(c->>'max','')::int;
    include_free := COALESCE((c->>'includeFree')::boolean, true);
    IF l.is_free THEN
      IF NOT include_free THEN CONTINUE; END IF;
    ELSE
      IF min_price IS NOT NULL AND (l.price_nok IS NULL OR l.price_nok < min_price) THEN CONTINUE; END IF;
      IF max_price IS NOT NULL AND (l.price_nok IS NULL OR l.price_nok > max_price) THEN CONTINUE; END IF;
    END IF;

    -- Terms (q split by whitespace, or terms array)
    terms := COALESCE(c->'terms', '[]'::jsonb);
    IF jsonb_array_length(terms) = 0 AND COALESCE(c->>'q','') <> '' THEN
      terms := to_jsonb(regexp_split_to_array(trim(c->>'q'), '\s+'));
    END IF;
    q_mode := COALESCE(c->>'qMode','all');
    IF jsonb_array_length(terms) > 0 THEN
      all_match := true;
      any_match := false;
      FOR term IN SELECT x.value FROM jsonb_array_elements_text(terms) x LOOP
        IF term IS NULL OR length(trim(term)) = 0 THEN CONTINUE; END IF;
        pattern := '%' || trim(term) || '%';
        term_matches := (COALESCE(l.title,'') ILIKE pattern)
                     OR (COALESCE(l.description,'') ILIKE pattern)
                     OR (COALESCE(l.city,'') ILIKE pattern);
        IF term_matches THEN any_match := true; ELSE all_match := false; END IF;
      END LOOP;
      IF q_mode = 'all' AND NOT all_match THEN CONTINUE; END IF;
      IF q_mode = 'any' AND NOT any_match THEN CONTINUE; END IF;
    END IF;

    -- Location/radius
    center_lat := NULLIF(c->>'lat','')::double precision;
    center_lng := NULLIF(c->>'lng','')::double precision;
    radius_km := COALESCE(NULLIF(c->>'radius','')::double precision, 10);
    IF center_lat IS NOT NULL AND center_lng IS NOT NULL THEN
      IF l.lat IS NULL OR l.lng IS NULL THEN CONTINUE; END IF;
      dist := 6371 * acos(LEAST(1.0, GREATEST(-1.0,
        cos(radians(center_lat)) * cos(radians(l.lat)) *
        cos(radians(l.lng) - radians(center_lng)) +
        sin(radians(center_lat)) * sin(radians(l.lat))
      )));
      IF dist > radius_km THEN CONTINUE; END IF;
    END IF;

    -- Match — insert notification (skip if seller is the saved-search owner)
    IF s.user_id <> l.seller_id THEN
      INSERT INTO public.saved_search_notifications (saved_search_id, user_id, listing_id)
      VALUES (s.id, s.user_id, l.id)
      ON CONFLICT (saved_search_id, listing_id) DO NOTHING;
    END IF;
  END LOOP;
END;
$$;


--
-- Name: match_search_synonyms(uuid, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_search_synonyms(p_category_id uuid, phrases text[]) RETURNS TABLE(phrase text, filter_key text, filter_label text, option_value text, option_label text, is_ambiguous boolean, category_id uuid)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  WITH RECURSIVE ancestors AS (
    SELECT id, parent_id FROM public.categories WHERE id = p_category_id
    UNION ALL
    SELECT c.id, c.parent_id
    FROM public.categories c
    JOIN ancestors a ON c.id = a.parent_id
  ),
  roots AS (
    SELECT id, id AS root_id FROM public.categories WHERE parent_id IS NULL
    UNION ALL
    SELECT c.id, r.root_id
    FROM public.categories c
    JOIN roots r ON c.parent_id = r.id
  )
  SELECT DISTINCT ON (p.phrase, cf.key)
    p.phrase,
    cf.key AS filter_key,
    cf.label_nb AS filter_label,
    fs.option_value,
    CASE
      WHEN fs.option_value IS NULL THEN NULL
      ELSE (
        SELECT opt->>'label_nb'
        FROM jsonb_array_elements(cf.options) opt
        WHERE opt->>'value' = fs.option_value
        LIMIT 1
      )
    END AS option_label,
    fs.is_ambiguous,
    COALESCE(r.root_id, cf.category_id) AS category_id
  FROM unnest(phrases) AS p(phrase)
  JOIN public.filter_synonyms fs ON fs.phrase = lower(p.phrase)
  JOIN public.category_filters cf ON cf.id = fs.category_filter_id
  LEFT JOIN roots r ON r.id = cf.category_id
  WHERE p_category_id IS NULL OR cf.category_id IN (SELECT id FROM ancestors)
  ORDER BY p.phrase, cf.key, length(p.phrase) DESC;
$$;


--
-- Name: messages_bump_conversation_last_message_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.messages_bump_conversation_last_message_at() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id
    AND last_message_at < NEW.created_at;
  RETURN NEW;
END;
$$;


--
-- Name: messages_enforce_block(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.messages_enforce_block() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _other uuid;
BEGIN
  SELECT CASE WHEN c.buyer_id = NEW.sender_id THEN c.seller_id ELSE c.buyer_id END
    INTO _other
  FROM public.conversations c
  WHERE c.id = NEW.conversation_id;

  IF _other IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_blocked_between(NEW.sender_id, _other, NEW.conversation_id) THEN
    RAISE EXCEPTION 'Meldingen kan ikke sendes fordi samtalen er blokkert'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: messages_enforce_moderation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.messages_enforce_moderation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF public.is_user_banned(NEW.sender_id) OR public.is_user_suspended(NEW.sender_id) THEN
    RAISE EXCEPTION 'Du kan ikke sende meldinger så lenge kontoen er sperret eller svartelistet'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: my_listing_counts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_listing_counts() RETURNS TABLE(listing_id uuid, view_count bigint, favorite_count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT l.id,
    (SELECT count(*) FROM public.listing_view_events e WHERE e.listing_id = l.id),
    (SELECT count(*) FROM public.favorites f WHERE f.listing_id = l.id)
  FROM public.listings l
  WHERE l.seller_id = auth.uid();
$$;


--
-- Name: my_moderation_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_moderation_status() RETURNS TABLE(is_banned boolean, ban_reason text, is_suspended boolean, suspension_reason text, suspension_expires_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.user_bans WHERE user_id = auth.uid()),
    (SELECT reason FROM public.user_bans WHERE user_id = auth.uid()),
    EXISTS (SELECT 1 FROM public.user_suspensions WHERE user_id = auth.uid() AND expires_at > now()),
    (SELECT reason FROM public.user_suspensions WHERE user_id = auth.uid() AND expires_at > now() ORDER BY expires_at DESC LIMIT 1),
    (SELECT expires_at FROM public.user_suspensions WHERE user_id = auth.uid() AND expires_at > now() ORDER BY expires_at DESC LIMIT 1)
$$;


--
-- Name: popular_listings_by_category(uuid[], integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.popular_listings_by_category(_category_ids uuid[], _limit integer DEFAULT 12, _offset integer DEFAULT 0) RETURNS TABLE(listing_id uuid, kaupet_code character, title text, subtitle text, price_nok integer, is_free boolean, city text, created_at timestamp with time zone, cover_path text, total_views bigint, views_last_week bigint, mileage_km numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    l.id,
    l.kaupet_code,
    l.title,
    l.subtitle,
    l.price_nok,
    l.is_free,
    l.city,
    l.created_at,
    (
      SELECT i.storage_path
      FROM public.listing_images i
      WHERE i.listing_id = l.id
      ORDER BY i.sort_order ASC
      LIMIT 1
    ) AS cover_path,
    (SELECT count(*) FROM public.listing_view_events e WHERE e.listing_id = l.id) AS total_views,
    (SELECT count(*) FROM public.listing_view_events e
       WHERE e.listing_id = l.id
         AND e.created_at > now() - interval '7 days') AS views_last_week,
    (l.attributes->>'mileage_km')::numeric AS mileage_km
  FROM public.listings l
  WHERE l.status = 'active'
    AND l.category_id = ANY(_category_ids)
  ORDER BY views_last_week DESC NULLS LAST, l.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 12), 60))
  OFFSET GREATEST(0, COALESCE(_offset, 0));
$$;


--
-- Name: popular_listings_last_week(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.popular_listings_last_week(_limit integer DEFAULT 8) RETURNS TABLE(listing_id uuid, kaupet_code character, title text, subtitle text, price_nok integer, is_free boolean, city text, created_at timestamp with time zone, cover_path text, total_views bigint, views_last_week bigint, mileage_km numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    l.id,
    l.kaupet_code,
    l.title,
    l.subtitle,
    l.price_nok,
    l.is_free,
    l.city,
    l.created_at,
    (
      SELECT i.storage_path
      FROM public.listing_images i
      WHERE i.listing_id = l.id
      ORDER BY i.sort_order ASC
      LIMIT 1
    ) AS cover_path,
    (SELECT count(*) FROM public.listing_view_events e WHERE e.listing_id = l.id) AS total_views,
    (SELECT count(*) FROM public.listing_view_events e
       WHERE e.listing_id = l.id
         AND e.created_at > now() - interval '7 days') AS views_last_week,
    (l.attributes->>'mileage_km')::numeric AS mileage_km
  FROM public.listings l
  WHERE l.status = 'active'
  ORDER BY views_last_week DESC NULLS LAST, l.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 8), 50));
$$;


--
-- Name: purge_expired_accounts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.purge_expired_accounts() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _count integer := 0;
  _row record;
BEGIN
  FOR _row IN
    SELECT user_id FROM public.account_deletions WHERE scheduled_purge_at <= now()
  LOOP
    -- Remove the user's own listings (cascade removes listing_images, favorites refs, conversations, messages, etc.)
    DELETE FROM public.listings WHERE seller_id = _row.user_id;

    -- Anonymize profile so messages/conversations still show a name
    UPDATE public.profiles
       SET display_name = 'Slettet bruker',
           avatar_url = NULL,
           deleted_at = now(),
           updated_at = now()
     WHERE id = _row.user_id;

    -- Finally remove auth user; profiles/conversations/messages no longer FK-cascade
    DELETE FROM auth.users WHERE id = _row.user_id;

    _count := _count + 1;
  END LOOP;
  RETURN _count;
END;
$$;


--
-- Name: request_account_deletion(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.request_account_deletion(_email text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _uid uuid := auth.uid();
  _actual_email text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO _actual_email FROM auth.users WHERE id = _uid;
  IF _actual_email IS NULL OR lower(_actual_email) <> lower(trim(_email)) THEN
    RAISE EXCEPTION 'E-postadressen stemmer ikke';
  END IF;

  -- Soft-delete: archive all listings
  UPDATE public.listings
  SET status = 'archived'
  WHERE seller_id = _uid AND status <> 'archived';

  INSERT INTO public.account_deletions (user_id, confirmation_email)
  VALUES (_uid, _actual_email)
  ON CONFLICT (user_id) DO UPDATE
    SET requested_at = now(),
        scheduled_purge_at = now() + interval '7 days',
        confirmation_email = EXCLUDED.confirmation_email;
END;
$$;


--
-- Name: saved_search_unread_counts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.saved_search_unread_counts() RETURNS TABLE(saved_search_id uuid, unread_count bigint)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT n.saved_search_id, count(*) AS unread_count
  FROM public.saved_search_notifications n
  WHERE n.user_id = auth.uid()
    AND n.read_at IS NULL
  GROUP BY n.saved_search_id;
$$;


--
-- Name: search_listing_ids(jsonb, text[], jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_listing_ids(include_groups jsonb DEFAULT '[]'::jsonb, exclude_any_terms text[] DEFAULT NULL::text[], exclude_all_groups jsonb DEFAULT '[]'::jsonb) RETURNS TABLE(id uuid, rank real)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT l.id, ts_rank(l.search_vector, q.query) AS rank
  FROM public.listings l
  CROSS JOIN LATERAL (
    SELECT websearch_to_tsquery(
      'norwegian',
      array_to_string(
        (SELECT array_agg(DISTINCT t) FROM jsonb_array_elements(include_groups) g,
          jsonb_array_elements_text(g->'terms') t),
        ' '
      )
    ) AS query
  ) q
  WHERE l.status = 'active'
    AND (
      include_groups = '[]'::jsonb
      OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(include_groups) g
        WHERE NOT (
          CASE WHEN g->>'mode' = 'all' THEN
            NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(g->'terms') t
              WHERE NOT public.listings_search_term_match(l.search_vector, l.title, t)
            )
          ELSE
            EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(g->'terms') t
              WHERE public.listings_search_term_match(l.search_vector, l.title, t)
            )
          END
        )
      )
    )
    AND (
      exclude_any_terms IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM unnest(exclude_any_terms) t
        WHERE l.search_vector @@ websearch_to_tsquery('norwegian', t)
      )
    )
    AND (
      exclude_all_groups = '[]'::jsonb
      OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(exclude_all_groups) g
        WHERE NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(g) t
          WHERE NOT (l.search_vector @@ websearch_to_tsquery('norwegian', t))
        )
      )
    )
  ORDER BY rank DESC
  LIMIT 1000;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


--
-- Name: submit_listing_report(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_listing_report(_listing_id uuid, _reason text, _comment text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.reports(listing_id, reporter_id, reason, comment)
  VALUES (_listing_id, auth.uid(), _reason, _comment);
END $$;


--
-- Name: submit_user_report(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_user_report(_reported_user_id uuid, _reason text, _comment text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF auth.uid() = _reported_user_id THEN RAISE EXCEPTION 'Cannot report yourself'; END IF;
  INSERT INTO public.reports(reporter_id, reported_user_id, reason, comment)
  VALUES (auth.uid(), _reported_user_id, _reason, _comment);
END $$;


--
-- Name: suggest_attribute_values(uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.suggest_attribute_values(p_category_id uuid, p_key text, p_limit integer DEFAULT 20) RETURNS TABLE(value text, listing_count bigint)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT (array_agg(raw ORDER BY freq DESC))[1] AS value, sum(freq)::bigint AS listing_count
  FROM (
    SELECT
      trim(l.attributes->>p_key) AS raw,
      lower(trim(l.attributes->>p_key)) AS norm,
      count(*) AS freq
    FROM public.listings l
    WHERE l.category_id = p_category_id
      AND l.status = 'active'
      AND l.attributes ? p_key
      AND trim(l.attributes->>p_key) <> ''
    GROUP BY raw, norm
  ) grouped
  GROUP BY norm
  ORDER BY listing_count DESC
  LIMIT p_limit;
$$;


--
-- Name: suggest_category_for_title(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.suggest_category_for_title(_title text) RETURNS TABLE(category_id uuid, slug text, name_nb text, parent_id uuid, parent_name_nb text, votes bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.slug, c.name_nb, c.parent_id, p.name_nb AS parent_name_nb,
         SUM(s.listing_count)::BIGINT AS votes
  FROM ts_stat(format('SELECT to_tsvector(''norwegian'', %L)', coalesce(_title, ''))) t
  JOIN public.listing_category_word_stats s ON s.lexeme = t.word
  JOIN public.categories c ON c.id = s.category_id
  LEFT JOIN public.categories p ON p.id = c.parent_id
  GROUP BY c.id, c.slug, c.name_nb, c.parent_id, p.name_nb
  ORDER BY votes DESC
  LIMIT 5;
END;
$$;


--
-- Name: suggest_keywords_for_listing(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.suggest_keywords_for_listing(_title text, _category_id uuid) RETURNS TABLE(word text, listing_count integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _title_words TEXT[];
BEGIN
  -- Extract words from the candidate title the same way the trigger does.
  SELECT array_agg(DISTINCT w)
  INTO _title_words
  FROM (
    SELECT regexp_split_to_table(
      lower(regexp_replace(coalesce(_title, ''), '[^a-zæøåA-ZÆØÅ0-9\s]', '', 'g')),
      '\s+'
    ) AS w
  ) sub
  WHERE length(w) >= 1;

  RETURN QUERY
  SELECT s.word, s.listing_count
  FROM public.listing_keyword_stats s
  WHERE s.category_id = _category_id
    AND s.listing_count >= 3
    AND (_title_words IS NULL OR s.word <> ALL(_title_words))
  ORDER BY s.listing_count DESC
  LIMIT 8;
END;
$$;


--
-- Name: sync_categories_from_payload(jsonb, jsonb, jsonb, jsonb, text[], uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_categories_from_payload(p_categories jsonb, p_category_filters jsonb, p_category_flows jsonb, p_filter_synonyms jsonb, p_default_search_examples text[], p_synced_by uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- 1. Kategori-id-kart: staging sin id -> endelig id i produksjon (behold
  -- produksjonens eksisterende id ved slug-treff, ellers staging sin id).
  CREATE TEMP TABLE _category_id_map (staging_id UUID PRIMARY KEY, final_id UUID NOT NULL) ON COMMIT DROP;
  INSERT INTO _category_id_map (staging_id, final_id)
  SELECT
    (r->>'id')::UUID,
    COALESCE(existing.id, (r->>'id')::UUID)
  FROM jsonb_array_elements(p_categories) r
  LEFT JOIN public.categories existing ON existing.slug = r->>'slug';

  -- 2. Upsert kategorier (parent_id håndteres i egne pass under, siden
  -- foreldre kan refereres før de er satt inn).
  INSERT INTO public.categories (
    id, slug, name_nb, parent_id, sort_order, icon, color, heading_font,
    search_examples, is_hidden, created_at, updated_at
  )
  SELECT
    m.final_id,
    r->>'slug',
    r->>'name_nb',
    NULL,
    (r->>'sort_order')::INT,
    r->>'icon',
    r->>'color',
    r->>'heading_font',
    COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(r->'search_examples') x), '{}'),
    COALESCE((r->>'is_hidden')::BOOLEAN, false),
    (r->>'created_at')::TIMESTAMPTZ,
    (r->>'updated_at')::TIMESTAMPTZ
  FROM jsonb_array_elements(p_categories) r
  JOIN _category_id_map m ON m.staging_id = (r->>'id')::UUID
  ON CONFLICT (id) DO UPDATE SET
    slug = EXCLUDED.slug,
    name_nb = EXCLUDED.name_nb,
    sort_order = EXCLUDED.sort_order,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color,
    heading_font = EXCLUDED.heading_font,
    search_examples = EXCLUDED.search_examples,
    is_hidden = EXCLUDED.is_hidden;

  -- Sett parent_id for kategorier som ifølge staging har en forelder.
  UPDATE public.categories c
  SET parent_id = pm.final_id
  FROM jsonb_array_elements(p_categories) r
  JOIN _category_id_map m ON m.staging_id = (r->>'id')::UUID
  JOIN _category_id_map pm ON pm.staging_id = (r->>'parent_id')::UUID
  WHERE c.id = m.final_id AND r->>'parent_id' IS NOT NULL;

  -- Nullstill parent_id for kategorier som ifølge staging IKKE lenger har
  -- en forelder (ellers henger en gammel produksjons-parent_id igjen, siden
  -- vi ikke lenger sletter og setter inn alle rader på nytt hver gang).
  UPDATE public.categories c
  SET parent_id = NULL
  WHERE c.parent_id IS NOT NULL
    AND c.id IN (SELECT final_id FROM _category_id_map)
    AND c.id NOT IN (
      SELECT m.final_id
      FROM jsonb_array_elements(p_categories) r
      JOIN _category_id_map m ON m.staging_id = (r->>'id')::UUID
      WHERE r->>'parent_id' IS NOT NULL
    );

  -- 3. Slett kategorier som ikke lenger finnes i staging (matchet på slug).
  -- Cascader kun for DISSE kategoriene til filtre/flows/synonymer/
  -- word-stats, og nullstiller listings.category_id kun for annonser i
  -- disse — ikke for uendrede kategorier.
  DELETE FROM public.categories
  WHERE slug NOT IN (SELECT r->>'slug' FROM jsonb_array_elements(p_categories) r);

  -- 4. Filter-id-kart: staging sin id -> endelig id (behold produksjonens
  -- eksisterende id ved kategori+key-treff, siden category_filters har
  -- UNIQUE(category_id, key)).
  CREATE TEMP TABLE _filter_id_map (
    staging_id UUID PRIMARY KEY, final_id UUID NOT NULL, final_category_id UUID NOT NULL
  ) ON COMMIT DROP;
  INSERT INTO _filter_id_map (staging_id, final_id, final_category_id)
  SELECT
    (r->>'id')::UUID,
    COALESCE(existing.id, (r->>'id')::UUID),
    m.final_id
  FROM jsonb_array_elements(p_category_filters) r
  JOIN _category_id_map m ON m.staging_id = (r->>'category_id')::UUID
  LEFT JOIN public.category_filters existing
    ON existing.category_id = m.final_id AND existing.key = r->>'key';

  INSERT INTO public.category_filters (
    id, category_id, key, label_nb, type, unit, options, sort_order,
    is_primary, depends_on_key, depends_on_value, created_at, updated_at
  )
  SELECT
    fm.final_id,
    fm.final_category_id,
    r->>'key',
    r->>'label_nb',
    r->>'type',
    r->>'unit',
    r->'options',
    (r->>'sort_order')::INT,
    COALESCE((r->>'is_primary')::BOOLEAN, false),
    r->>'depends_on_key',
    r->>'depends_on_value',
    (r->>'created_at')::TIMESTAMPTZ,
    (r->>'updated_at')::TIMESTAMPTZ
  FROM jsonb_array_elements(p_category_filters) r
  JOIN _filter_id_map fm ON fm.staging_id = (r->>'id')::UUID
  ON CONFLICT (id) DO UPDATE SET
    category_id = EXCLUDED.category_id,
    key = EXCLUDED.key,
    label_nb = EXCLUDED.label_nb,
    type = EXCLUDED.type,
    unit = EXCLUDED.unit,
    options = EXCLUDED.options,
    sort_order = EXCLUDED.sort_order,
    is_primary = EXCLUDED.is_primary,
    depends_on_key = EXCLUDED.depends_on_key,
    depends_on_value = EXCLUDED.depends_on_value;

  DELETE FROM public.category_filters
  WHERE id NOT IN (SELECT final_id FROM _filter_id_map);

  -- 5. Flow-id-kart: staging sin id -> endelig id (behold produksjonens
  -- eksisterende id ved kategori-treff, siden category_flows har
  -- UNIQUE(category_id)).
  CREATE TEMP TABLE _flow_id_map (
    staging_id UUID PRIMARY KEY, final_id UUID NOT NULL, final_category_id UUID NOT NULL
  ) ON COMMIT DROP;
  INSERT INTO _flow_id_map (staging_id, final_id, final_category_id)
  SELECT
    (r->>'id')::UUID,
    COALESCE(existing.id, (r->>'id')::UUID),
    m.final_id
  FROM jsonb_array_elements(p_category_flows) r
  JOIN _category_id_map m ON m.staging_id = (r->>'category_id')::UUID
  LEFT JOIN public.category_flows existing ON existing.category_id = m.final_id;

  INSERT INTO public.category_flows (
    id, category_id, steps, modules, field_groups, sort_order, created_at, updated_at
  )
  SELECT
    fm.final_id,
    fm.final_category_id,
    COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(r->'steps') x), '{}'),
    COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(r->'modules') x), '{}'),
    COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(r->'field_groups') x), '{}'),
    (r->>'sort_order')::INT,
    (r->>'created_at')::TIMESTAMPTZ,
    (r->>'updated_at')::TIMESTAMPTZ
  FROM jsonb_array_elements(p_category_flows) r
  JOIN _flow_id_map fm ON fm.staging_id = (r->>'id')::UUID
  ON CONFLICT (id) DO UPDATE SET
    category_id = EXCLUDED.category_id,
    steps = EXCLUDED.steps,
    modules = EXCLUDED.modules,
    field_groups = EXCLUDED.field_groups,
    sort_order = EXCLUDED.sort_order;

  DELETE FROM public.category_flows
  WHERE id NOT IN (SELECT final_id FROM _flow_id_map);

  -- 6. Synonym-id-kart: staging sin id -> endelig id (behold produksjonens
  -- eksisterende id ved filter+option+phrase-treff, siden filter_synonyms
  -- har UNIQUE(category_filter_id, option_value, phrase)).
  CREATE TEMP TABLE _synonym_id_map (
    staging_id UUID PRIMARY KEY, final_id UUID NOT NULL, final_filter_id UUID NOT NULL
  ) ON COMMIT DROP;
  INSERT INTO _synonym_id_map (staging_id, final_id, final_filter_id)
  SELECT
    (r->>'id')::UUID,
    COALESCE(existing.id, (r->>'id')::UUID),
    fm.final_id
  FROM jsonb_array_elements(p_filter_synonyms) r
  JOIN _filter_id_map fm ON fm.staging_id = (r->>'category_filter_id')::UUID
  LEFT JOIN public.filter_synonyms existing
    ON existing.category_filter_id = fm.final_id
    AND existing.option_value IS NOT DISTINCT FROM (r->>'option_value')
    AND existing.phrase = r->>'phrase';

  INSERT INTO public.filter_synonyms (
    id, category_filter_id, option_value, phrase, is_generated, created_at, updated_at
  )
  SELECT
    sm.final_id,
    sm.final_filter_id,
    r->>'option_value',
    r->>'phrase',
    COALESCE((r->>'is_generated')::BOOLEAN, true),
    (r->>'created_at')::TIMESTAMPTZ,
    (r->>'updated_at')::TIMESTAMPTZ
  FROM jsonb_array_elements(p_filter_synonyms) r
  JOIN _synonym_id_map sm ON sm.staging_id = (r->>'id')::UUID
  ON CONFLICT (id) DO UPDATE SET
    category_filter_id = EXCLUDED.category_filter_id,
    option_value = EXCLUDED.option_value,
    phrase = EXCLUDED.phrase,
    is_generated = EXCLUDED.is_generated;

  DELETE FROM public.filter_synonyms
  WHERE id NOT IN (SELECT final_id FROM _synonym_id_map);

  UPDATE public.site_settings
  SET default_search_examples = p_default_search_examples
  WHERE id = true;

  UPDATE public.category_sync_status
  SET last_synced_at = now(), last_synced_by = p_synced_by
  WHERE id = true;
END;
$$;


--
-- Name: sync_filter_synonyms_from_options(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_filter_synonyms_from_options() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  DELETE FROM public.filter_synonyms
  WHERE category_filter_id = NEW.id AND is_generated = true;

  IF NEW.type IN ('select', 'multiselect') THEN
    INSERT INTO public.filter_synonyms (category_filter_id, option_value, phrase, is_generated)
    SELECT NEW.id, opt->>'value', lower(opt->>'label_nb'), true
    FROM jsonb_array_elements(coalesce(NEW.options, '[]'::jsonb)) opt
    WHERE trim(coalesce(opt->>'label_nb', '')) <> ''
    ON CONFLICT (category_filter_id, option_value, phrase) DO NOTHING;
  ELSIF NEW.type = 'boolean' THEN
    INSERT INTO public.filter_synonyms (category_filter_id, option_value, phrase, is_generated)
    VALUES (NEW.id, NULL, lower(NEW.label_nb), true)
    ON CONFLICT (category_filter_id, option_value, phrase) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: update_wtb_listings_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_wtb_listings_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: user_review_summary(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_review_summary(_user_id uuid) RETURNS TABLE(avg_rating numeric, review_count integer)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT
    COALESCE(ROUND(AVG(rating)::numeric, 2), 0)::numeric AS avg_rating,
    COUNT(*)::int AS review_count
  FROM public.user_reviews
  WHERE reviewee_id = _user_id;
$$;


--
-- Name: user_reviews_validate(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_reviews_validate() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _sale record;
BEGIN
  SELECT seller_id, buyer_id INTO _sale
  FROM public.listing_sales WHERE listing_id = NEW.listing_id;
  IF _sale IS NULL THEN
    RAISE EXCEPTION 'Det finnes ingen bekreftet kjøper for denne annonsen';
  END IF;

  IF NEW.role = 'buyer' THEN
    IF _sale.buyer_id <> NEW.reviewer_id OR _sale.seller_id <> NEW.reviewee_id THEN
      RAISE EXCEPTION 'Vurderingen samsvarer ikke med salget';
    END IF;
  ELSE -- seller
    IF _sale.seller_id <> NEW.reviewer_id OR _sale.buyer_id <> NEW.reviewee_id THEN
      RAISE EXCEPTION 'Vurderingen samsvarer ikke med salget';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: account_deletions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_deletions (
    user_id uuid NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    scheduled_purge_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    confirmation_email text NOT NULL
);


--
-- Name: admin_moderation_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_moderation_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_id uuid NOT NULL,
    action text NOT NULL,
    target_type text NOT NULL,
    target_id text,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    key text NOT NULL,
    value text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name_nb text NOT NULL,
    parent_id uuid,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    icon text,
    color text,
    heading_font text,
    search_examples text[] DEFAULT '{}'::text[] NOT NULL,
    is_hidden boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: category_filters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.category_filters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid NOT NULL,
    key text NOT NULL,
    label_nb text NOT NULL,
    type text NOT NULL,
    unit text,
    options jsonb,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_primary boolean DEFAULT true NOT NULL,
    depends_on_key text,
    depends_on_value text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT category_filters_type_check CHECK ((type = ANY (ARRAY['select'::text, 'multiselect'::text, 'number'::text, 'range'::text, 'boolean'::text, 'text'::text, 'brand_select'::text, 'model_select'::text])))
);


--
-- Name: category_flows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.category_flows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid NOT NULL,
    steps text[] DEFAULT '{title-photos,category-details,price-location,review-publish}'::text[] NOT NULL,
    modules text[] DEFAULT '{generic-attributes}'::text[] NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    field_groups text[] DEFAULT '{title-photos,category-attributes,condition,price,description-keywords,delivery-location,review-publish}'::text[] NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT category_flows_field_groups_required CHECK ((field_groups @> ARRAY['title-photos'::text, 'category-attributes'::text, 'description-keywords'::text, 'review-publish'::text]))
);


--
-- Name: category_sync_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.category_sync_status (
    id boolean DEFAULT true NOT NULL,
    last_synced_at timestamp with time zone,
    last_synced_by uuid,
    CONSTRAINT category_sync_status_singleton CHECK (id)
);


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid,
    buyer_id uuid NOT NULL,
    seller_id uuid NOT NULL,
    last_message_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    buyer_last_read_at timestamp with time zone,
    seller_last_read_at timestamp with time zone,
    wtb_listing_id uuid,
    CONSTRAINT conversations_has_listing CHECK (((listing_id IS NOT NULL) OR (wtb_listing_id IS NOT NULL)))
);

ALTER TABLE ONLY public.conversations REPLICA IDENTITY FULL;


--
-- Name: error_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.error_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    function_name text NOT NULL,
    error_message text NOT NULL,
    error_code text,
    context jsonb,
    user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: favorite_price_drops; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.favorite_price_drops (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    listing_id uuid NOT NULL,
    old_price_nok integer NOT NULL,
    new_price_nok integer NOT NULL,
    drop_pct numeric(5,2) NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: favorite_sold_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.favorite_sold_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    listing_id uuid NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: favorites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.favorites (
    user_id uuid NOT NULL,
    listing_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: filter_synonyms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.filter_synonyms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_filter_id uuid NOT NULL,
    option_value text,
    phrase text NOT NULL,
    is_generated boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_ambiguous boolean DEFAULT false NOT NULL
);


--
-- Name: ip_bans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ip_bans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ip_address inet NOT NULL,
    reason text NOT NULL,
    banned_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone
);


--
-- Name: listing_360_capture_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listing_360_capture_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid NOT NULL,
    token text NOT NULL,
    created_by uuid NOT NULL,
    expires_at timestamp with time zone,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: listing_360_frames; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listing_360_frames (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid NOT NULL,
    storage_path text NOT NULL,
    frame_order integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: listing_category_word_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listing_category_word_stats (
    lexeme text NOT NULL,
    category_id uuid NOT NULL,
    listing_count integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: listing_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listing_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid NOT NULL,
    storage_path text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    caption text
);


--
-- Name: listing_keyword_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listing_keyword_stats (
    word text NOT NULL,
    category_id uuid NOT NULL,
    listing_count integer DEFAULT 0 NOT NULL
);


--
-- Name: listing_promotions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listing_promotions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid NOT NULL,
    user_id uuid NOT NULL,
    duration_days integer NOT NULL,
    price_nok integer NOT NULL,
    status public.promotion_status DEFAULT 'pending'::public.promotion_status NOT NULL,
    is_gift boolean DEFAULT false NOT NULL,
    gift_reason text,
    granted_by uuid,
    vipps_reference text,
    vipps_psp_reference text,
    starts_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    refunded_at timestamp with time zone,
    CONSTRAINT listing_promotions_duration_days_check CHECK ((duration_days > 0)),
    CONSTRAINT listing_promotions_price_nok_check CHECK ((price_nok >= 0))
);


--
-- Name: listing_sales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listing_sales (
    listing_id uuid NOT NULL,
    seller_id uuid NOT NULL,
    buyer_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    confirmed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: listing_view_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listing_view_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid NOT NULL,
    visitor_key text NOT NULL,
    user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: listing_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listing_views (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid NOT NULL,
    visitor_key text NOT NULL,
    user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: listings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.listings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    seller_id uuid NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    price_nok integer,
    is_free boolean DEFAULT false NOT NULL,
    category_id uuid,
    condition public.listing_condition,
    postal_code text,
    city text,
    lat double precision,
    lng double precision,
    status public.listing_status DEFAULT 'draft'::public.listing_status NOT NULL,
    view_count integer DEFAULT 0 NOT NULL,
    search_vector tsvector,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    published_at timestamp with time zone,
    expires_at timestamp with time zone,
    kaupet_code character(8) DEFAULT public.generate_kaupet_code() NOT NULL,
    display_lat double precision,
    display_lng double precision,
    counted_category_id uuid,
    counted_lexemes text[],
    can_ship boolean,
    counted_keyword_category_id uuid,
    counted_keywords text[],
    attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
    subtitle text,
    known_issues text,
    no_known_issues boolean DEFAULT false NOT NULL,
    maintenance_history text,
    CONSTRAINT listings_kaupet_code_format CHECK ((kaupet_code ~ '^[0-9]{8}$'::text))
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);

ALTER TABLE ONLY public.messages REPLICA IDENTITY FULL;


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preferences (
    user_id uuid NOT NULL,
    web_push_messages boolean DEFAULT true NOT NULL,
    web_push_saved_searches boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    web_push_price_drops boolean DEFAULT true NOT NULL,
    web_push_sold boolean DEFAULT true NOT NULL,
    email_messages boolean DEFAULT false NOT NULL,
    email_saved_searches boolean DEFAULT false NOT NULL,
    email_price_drops boolean DEFAULT false NOT NULL,
    email_sold boolean DEFAULT false NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    display_name text NOT NULL,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: promotion_pricing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotion_pricing (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    duration_days integer NOT NULL,
    price_nok integer NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT promotion_pricing_duration_days_check CHECK ((duration_days > 0)),
    CONSTRAINT promotion_pricing_price_nok_check CHECK ((price_nok >= 0))
);


--
-- Name: push_dispatch_failures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_dispatch_failures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind text NOT NULL,
    payload jsonb NOT NULL,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    endpoint text,
    p256dh text,
    auth text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone DEFAULT now() NOT NULL,
    platform text DEFAULT 'web'::text NOT NULL,
    fcm_token text,
    CONSTRAINT push_subscriptions_platform_check CHECK ((platform = ANY (ARRAY['web'::text, 'android'::text, 'ios'::text]))),
    CONSTRAINT push_subscriptions_platform_fields_check CHECK ((((platform = 'web'::text) AND (endpoint IS NOT NULL) AND (p256dh IS NOT NULL) AND (auth IS NOT NULL)) OR ((platform = ANY (ARRAY['android'::text, 'ios'::text])) AND (fcm_token IS NOT NULL))))
);


--
-- Name: reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid,
    reporter_id uuid NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    comment text,
    resolved_at timestamp with time zone,
    resolved_by uuid,
    reported_user_id uuid,
    CONSTRAINT reports_target_check CHECK (((listing_id IS NOT NULL) OR (reported_user_id IS NOT NULL)))
);


--
-- Name: saved_search_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_search_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    saved_search_id uuid NOT NULL,
    user_id uuid NOT NULL,
    listing_id uuid NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.saved_search_notifications REPLICA IDENTITY FULL;


--
-- Name: saved_searches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_searches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    criteria jsonb DEFAULT '{}'::jsonb NOT NULL,
    notify boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: search_query_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.search_query_stats (
    query text NOT NULL,
    search_count integer DEFAULT 0 NOT NULL,
    zero_result_count integer DEFAULT 0 NOT NULL,
    last_searched_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: site_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_settings (
    id boolean DEFAULT true NOT NULL,
    default_search_examples text[] DEFAULT '{}'::text[] NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT site_settings_singleton CHECK (id)
);


--
-- Name: system_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipient_id uuid NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    read_at timestamp with time zone
);


--
-- Name: user_bans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_bans (
    user_id uuid NOT NULL,
    reason text NOT NULL,
    banned_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    blocker_id uuid NOT NULL,
    blocked_id uuid NOT NULL,
    scope public.block_scope NOT NULL,
    conversation_id uuid,
    listing_id uuid,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_blocks_check CHECK ((blocker_id <> blocked_id)),
    CONSTRAINT user_blocks_check1 CHECK ((((scope = 'all'::public.block_scope) AND (conversation_id IS NULL)) OR ((scope = 'conversation'::public.block_scope) AND (conversation_id IS NOT NULL))))
);


--
-- Name: user_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid NOT NULL,
    reviewer_id uuid NOT NULL,
    reviewee_id uuid NOT NULL,
    role text NOT NULL,
    rating smallint NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_reviews_check CHECK ((reviewer_id <> reviewee_id)),
    CONSTRAINT user_reviews_comment_check CHECK (((comment IS NULL) OR (length(comment) <= 500))),
    CONSTRAINT user_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5))),
    CONSTRAINT user_reviews_role_check CHECK ((role = ANY (ARRAY['buyer'::text, 'seller'::text])))
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_suspensions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_suspensions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    reason text NOT NULL,
    suspended_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: vehicle_lookup_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicle_lookup_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    registration_number text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    classification_result jsonb
);


--
-- Name: vipps_webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vipps_webhook_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id text NOT NULL,
    reference text,
    event_name text,
    payload jsonb NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone
);


--
-- Name: vipps_webhook_secrets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vipps_webhook_secrets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mode text NOT NULL,
    webhook_id text NOT NULL,
    url text NOT NULL,
    secret text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vipps_webhook_secrets_mode_check CHECK ((mode = ANY (ARRAY['test'::text, 'production'::text])))
);


--
-- Name: wtb_listings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wtb_listings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    category_id uuid,
    max_price_nok integer,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '90 days'::interval) NOT NULL,
    search_vector tsvector GENERATED ALWAYS AS (to_tsvector('norwegian'::regconfig, ((COALESCE(title, ''::text) || ' '::text) || COALESCE(description, ''::text)))) STORED,
    attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
    subtitle text,
    CONSTRAINT wtb_listings_description_check CHECK (((description IS NULL) OR (char_length(TRIM(BOTH FROM description)) <= 2000))),
    CONSTRAINT wtb_listings_max_price_nok_check CHECK (((max_price_nok IS NULL) OR ((max_price_nok >= 0) AND (max_price_nok <= 10000000)))),
    CONSTRAINT wtb_listings_status_check CHECK ((status = ANY (ARRAY['active'::text, 'fulfilled'::text, 'expired'::text, 'archived'::text]))),
    CONSTRAINT wtb_listings_title_check CHECK (((char_length(TRIM(BOTH FROM title)) >= 3) AND (char_length(TRIM(BOTH FROM title)) <= 120)))
);


--
-- Name: account_deletions account_deletions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_deletions
    ADD CONSTRAINT account_deletions_pkey PRIMARY KEY (user_id);


--
-- Name: admin_moderation_log admin_moderation_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_moderation_log
    ADD CONSTRAINT admin_moderation_log_pkey PRIMARY KEY (id);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: categories categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_slug_key UNIQUE (slug);


--
-- Name: category_filters category_filters_category_id_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_filters
    ADD CONSTRAINT category_filters_category_id_key_key UNIQUE (category_id, key);


--
-- Name: category_filters category_filters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_filters
    ADD CONSTRAINT category_filters_pkey PRIMARY KEY (id);


--
-- Name: category_flows category_flows_category_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_flows
    ADD CONSTRAINT category_flows_category_id_key UNIQUE (category_id);


--
-- Name: category_flows category_flows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_flows
    ADD CONSTRAINT category_flows_pkey PRIMARY KEY (id);


--
-- Name: category_sync_status category_sync_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_sync_status
    ADD CONSTRAINT category_sync_status_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_listing_id_buyer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_listing_id_buyer_id_key UNIQUE (listing_id, buyer_id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: error_log error_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.error_log
    ADD CONSTRAINT error_log_pkey PRIMARY KEY (id);


--
-- Name: favorite_price_drops favorite_price_drops_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorite_price_drops
    ADD CONSTRAINT favorite_price_drops_pkey PRIMARY KEY (id);


--
-- Name: favorite_price_drops favorite_price_drops_user_id_listing_id_old_price_nok_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorite_price_drops
    ADD CONSTRAINT favorite_price_drops_user_id_listing_id_old_price_nok_key UNIQUE (user_id, listing_id, old_price_nok);


--
-- Name: favorite_sold_notifications favorite_sold_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorite_sold_notifications
    ADD CONSTRAINT favorite_sold_notifications_pkey PRIMARY KEY (id);


--
-- Name: favorite_sold_notifications favorite_sold_notifications_user_id_listing_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorite_sold_notifications
    ADD CONSTRAINT favorite_sold_notifications_user_id_listing_id_key UNIQUE (user_id, listing_id);


--
-- Name: favorites favorites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_pkey PRIMARY KEY (user_id, listing_id);


--
-- Name: filter_synonyms filter_synonyms_category_filter_id_option_value_phrase_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.filter_synonyms
    ADD CONSTRAINT filter_synonyms_category_filter_id_option_value_phrase_key UNIQUE (category_filter_id, option_value, phrase);


--
-- Name: filter_synonyms filter_synonyms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.filter_synonyms
    ADD CONSTRAINT filter_synonyms_pkey PRIMARY KEY (id);


--
-- Name: ip_bans ip_bans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ip_bans
    ADD CONSTRAINT ip_bans_pkey PRIMARY KEY (id);


--
-- Name: listing_360_capture_sessions listing_360_capture_sessions_listing_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_360_capture_sessions
    ADD CONSTRAINT listing_360_capture_sessions_listing_id_key UNIQUE (listing_id);


--
-- Name: listing_360_capture_sessions listing_360_capture_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_360_capture_sessions
    ADD CONSTRAINT listing_360_capture_sessions_pkey PRIMARY KEY (id);


--
-- Name: listing_360_capture_sessions listing_360_capture_sessions_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_360_capture_sessions
    ADD CONSTRAINT listing_360_capture_sessions_token_key UNIQUE (token);


--
-- Name: listing_360_frames listing_360_frames_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_360_frames
    ADD CONSTRAINT listing_360_frames_pkey PRIMARY KEY (id);


--
-- Name: listing_category_word_stats listing_category_word_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_category_word_stats
    ADD CONSTRAINT listing_category_word_stats_pkey PRIMARY KEY (lexeme, category_id);


--
-- Name: listing_images listing_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_images
    ADD CONSTRAINT listing_images_pkey PRIMARY KEY (id);


--
-- Name: listing_keyword_stats listing_keyword_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_keyword_stats
    ADD CONSTRAINT listing_keyword_stats_pkey PRIMARY KEY (word, category_id);


--
-- Name: listing_promotions listing_promotions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_promotions
    ADD CONSTRAINT listing_promotions_pkey PRIMARY KEY (id);


--
-- Name: listing_promotions listing_promotions_vipps_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_promotions
    ADD CONSTRAINT listing_promotions_vipps_reference_key UNIQUE (vipps_reference);


--
-- Name: listing_sales listing_sales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_sales
    ADD CONSTRAINT listing_sales_pkey PRIMARY KEY (listing_id);


--
-- Name: listing_view_events listing_view_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_view_events
    ADD CONSTRAINT listing_view_events_pkey PRIMARY KEY (id);


--
-- Name: listing_views listing_views_listing_visitor_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_views
    ADD CONSTRAINT listing_views_listing_visitor_unique UNIQUE (listing_id, visitor_key);


--
-- Name: listing_views listing_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_views
    ADD CONSTRAINT listing_views_pkey PRIMARY KEY (id);


--
-- Name: listings listings_kaupet_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listings
    ADD CONSTRAINT listings_kaupet_code_unique UNIQUE (kaupet_code);


--
-- Name: listings listings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listings
    ADD CONSTRAINT listings_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: promotion_pricing promotion_pricing_duration_days_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_pricing
    ADD CONSTRAINT promotion_pricing_duration_days_key UNIQUE (duration_days);


--
-- Name: promotion_pricing promotion_pricing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion_pricing
    ADD CONSTRAINT promotion_pricing_pkey PRIMARY KEY (id);


--
-- Name: push_dispatch_failures push_dispatch_failures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_dispatch_failures
    ADD CONSTRAINT push_dispatch_failures_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);


--
-- Name: push_subscriptions push_subscriptions_fcm_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_fcm_token_key UNIQUE (fcm_token);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);


--
-- Name: saved_search_notifications saved_search_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_search_notifications
    ADD CONSTRAINT saved_search_notifications_pkey PRIMARY KEY (id);


--
-- Name: saved_search_notifications saved_search_notifications_saved_search_id_listing_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_search_notifications
    ADD CONSTRAINT saved_search_notifications_saved_search_id_listing_id_key UNIQUE (saved_search_id, listing_id);


--
-- Name: saved_searches saved_searches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_searches
    ADD CONSTRAINT saved_searches_pkey PRIMARY KEY (id);


--
-- Name: search_query_stats search_query_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_query_stats
    ADD CONSTRAINT search_query_stats_pkey PRIMARY KEY (query);


--
-- Name: site_settings site_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings
    ADD CONSTRAINT site_settings_pkey PRIMARY KEY (id);


--
-- Name: system_messages system_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_messages
    ADD CONSTRAINT system_messages_pkey PRIMARY KEY (id);


--
-- Name: user_bans user_bans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_bans
    ADD CONSTRAINT user_bans_pkey PRIMARY KEY (user_id);


--
-- Name: user_blocks user_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_pkey PRIMARY KEY (id);


--
-- Name: user_reviews user_reviews_listing_id_reviewer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_reviews
    ADD CONSTRAINT user_reviews_listing_id_reviewer_id_key UNIQUE (listing_id, reviewer_id);


--
-- Name: user_reviews user_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_reviews
    ADD CONSTRAINT user_reviews_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: user_suspensions user_suspensions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_suspensions
    ADD CONSTRAINT user_suspensions_pkey PRIMARY KEY (id);


--
-- Name: vehicle_brands vehicle_brands_name_category_group_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_brands
    ADD CONSTRAINT vehicle_brands_name_category_group_key UNIQUE (name, category_group);


--
-- Name: vehicle_brands vehicle_brands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_brands
    ADD CONSTRAINT vehicle_brands_pkey PRIMARY KEY (id);


--
-- Name: vehicle_lookup_log vehicle_lookup_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_lookup_log
    ADD CONSTRAINT vehicle_lookup_log_pkey PRIMARY KEY (id);


--
-- Name: vehicle_model_classes vehicle_model_classes_brand_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_model_classes
    ADD CONSTRAINT vehicle_model_classes_brand_id_name_key UNIQUE (brand_id, name);


--
-- Name: vehicle_model_classes vehicle_model_classes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_model_classes
    ADD CONSTRAINT vehicle_model_classes_pkey PRIMARY KEY (id);


--
-- Name: vehicle_models vehicle_models_brand_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_models
    ADD CONSTRAINT vehicle_models_brand_id_name_key UNIQUE (brand_id, name);


--
-- Name: vehicle_models vehicle_models_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_models
    ADD CONSTRAINT vehicle_models_pkey PRIMARY KEY (id);


--
-- Name: vipps_webhook_events vipps_webhook_events_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vipps_webhook_events
    ADD CONSTRAINT vipps_webhook_events_event_id_key UNIQUE (event_id);


--
-- Name: vipps_webhook_events vipps_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vipps_webhook_events
    ADD CONSTRAINT vipps_webhook_events_pkey PRIMARY KEY (id);


--
-- Name: vipps_webhook_secrets vipps_webhook_secrets_mode_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vipps_webhook_secrets
    ADD CONSTRAINT vipps_webhook_secrets_mode_key UNIQUE (mode);


--
-- Name: vipps_webhook_secrets vipps_webhook_secrets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vipps_webhook_secrets
    ADD CONSTRAINT vipps_webhook_secrets_pkey PRIMARY KEY (id);


--
-- Name: wtb_listings wtb_listings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wtb_listings
    ADD CONSTRAINT wtb_listings_pkey PRIMARY KEY (id);


--
-- Name: admin_moderation_log_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_moderation_log_created_idx ON public.admin_moderation_log USING btree (created_at DESC);


--
-- Name: category_filters_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX category_filters_category_idx ON public.category_filters USING btree (category_id, sort_order);


--
-- Name: category_flows_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX category_flows_category_idx ON public.category_flows USING btree (category_id);


--
-- Name: conversations_buyer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_buyer_idx ON public.conversations USING btree (buyer_id, last_message_at DESC);


--
-- Name: conversations_seller_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_seller_idx ON public.conversations USING btree (seller_id, last_message_at DESC);


--
-- Name: error_log_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX error_log_created_idx ON public.error_log USING btree (created_at DESC);


--
-- Name: favorite_price_drops_user_unread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX favorite_price_drops_user_unread_idx ON public.favorite_price_drops USING btree (user_id, read_at, created_at DESC);


--
-- Name: favorite_sold_notifications_user_unread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX favorite_sold_notifications_user_unread_idx ON public.favorite_sold_notifications USING btree (user_id, read_at, created_at DESC);


--
-- Name: filter_synonyms_filter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX filter_synonyms_filter_idx ON public.filter_synonyms USING btree (category_filter_id);


--
-- Name: filter_synonyms_phrase_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX filter_synonyms_phrase_idx ON public.filter_synonyms USING btree (phrase);


--
-- Name: idx_listing_promotions_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_listing_promotions_active ON public.listing_promotions USING btree (status, expires_at);


--
-- Name: idx_listing_promotions_listing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_listing_promotions_listing ON public.listing_promotions USING btree (listing_id);


--
-- Name: idx_listing_promotions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_listing_promotions_user ON public.listing_promotions USING btree (user_id);


--
-- Name: ip_bans_ip_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ip_bans_ip_unique ON public.ip_bans USING btree (ip_address);


--
-- Name: listing_360_capture_sessions_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_360_capture_sessions_listing_idx ON public.listing_360_capture_sessions USING btree (listing_id);


--
-- Name: listing_360_frames_listing_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX listing_360_frames_listing_order_idx ON public.listing_360_frames USING btree (listing_id, frame_order);


--
-- Name: listing_category_word_stats_lexeme_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_category_word_stats_lexeme_idx ON public.listing_category_word_stats USING btree (lexeme);


--
-- Name: listing_images_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_images_listing_idx ON public.listing_images USING btree (listing_id, sort_order);


--
-- Name: listing_keyword_stats_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_keyword_stats_category_idx ON public.listing_keyword_stats USING btree (category_id, listing_count DESC);


--
-- Name: listing_sales_buyer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_sales_buyer_idx ON public.listing_sales USING btree (buyer_id);


--
-- Name: listing_sales_seller_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_sales_seller_idx ON public.listing_sales USING btree (seller_id);


--
-- Name: listing_view_events_listing_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_view_events_listing_id_idx ON public.listing_view_events USING btree (listing_id);


--
-- Name: listing_view_events_listing_visitor_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_view_events_listing_visitor_created_idx ON public.listing_view_events USING btree (listing_id, visitor_key, created_at DESC);


--
-- Name: listing_views_listing_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listing_views_listing_id_idx ON public.listing_views USING btree (listing_id);


--
-- Name: listings_attributes_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_attributes_idx ON public.listings USING gin (attributes);


--
-- Name: listings_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_category_idx ON public.listings USING btree (category_id);


--
-- Name: listings_search_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_search_idx ON public.listings USING gin (search_vector);


--
-- Name: listings_seller_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_seller_idx ON public.listings USING btree (seller_id);


--
-- Name: listings_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_status_idx ON public.listings USING btree (status, published_at DESC);


--
-- Name: listings_title_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX listings_title_trgm_idx ON public.listings USING gin (title public.gin_trgm_ops);


--
-- Name: messages_conversation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_conversation_idx ON public.messages USING btree (conversation_id, created_at);


--
-- Name: push_subscriptions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX push_subscriptions_user_id_idx ON public.push_subscriptions USING btree (user_id);


--
-- Name: saved_searches_notify_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX saved_searches_notify_idx ON public.saved_searches USING btree (notify) WHERE (notify = true);


--
-- Name: saved_searches_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX saved_searches_user_idx ON public.saved_searches USING btree (user_id);


--
-- Name: ssn_user_unread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ssn_user_unread_idx ON public.saved_search_notifications USING btree (user_id, read_at, created_at DESC);


--
-- Name: system_messages_recipient_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX system_messages_recipient_idx ON public.system_messages USING btree (recipient_id, created_at DESC);


--
-- Name: uniq_active_promotion_per_listing; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_active_promotion_per_listing ON public.listing_promotions USING btree (listing_id) WHERE (status = ANY (ARRAY['active'::public.promotion_status, 'pending'::public.promotion_status, 'gifted'::public.promotion_status]));


--
-- Name: user_blocks_all_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_blocks_all_unique ON public.user_blocks USING btree (blocker_id, blocked_id) WHERE (scope = 'all'::public.block_scope);


--
-- Name: user_blocks_blocked_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_blocks_blocked_idx ON public.user_blocks USING btree (blocked_id);


--
-- Name: user_blocks_blocker_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_blocks_blocker_idx ON public.user_blocks USING btree (blocker_id);


--
-- Name: user_blocks_conv_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_blocks_conv_unique ON public.user_blocks USING btree (blocker_id, conversation_id) WHERE (scope = 'conversation'::public.block_scope);


--
-- Name: user_reviews_listing_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_reviews_listing_idx ON public.user_reviews USING btree (listing_id);


--
-- Name: user_reviews_reviewee_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_reviews_reviewee_idx ON public.user_reviews USING btree (reviewee_id, created_at DESC);


--
-- Name: user_suspensions_user_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_suspensions_user_active_idx ON public.user_suspensions USING btree (user_id, expires_at);


--
-- Name: vehicle_brands_group_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vehicle_brands_group_idx ON public.vehicle_brands USING btree (category_group, name);


--
-- Name: vehicle_brands_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vehicle_brands_pending_idx ON public.vehicle_brands USING btree (status) WHERE (status = 'pending'::text);


--
-- Name: vehicle_lookup_log_user_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vehicle_lookup_log_user_time_idx ON public.vehicle_lookup_log USING btree (user_id, created_at);


--
-- Name: vehicle_model_classes_brand_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vehicle_model_classes_brand_idx ON public.vehicle_model_classes USING btree (brand_id, name);


--
-- Name: vehicle_model_classes_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vehicle_model_classes_pending_idx ON public.vehicle_model_classes USING btree (status) WHERE (status = 'pending'::text);


--
-- Name: vehicle_models_brand_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vehicle_models_brand_idx ON public.vehicle_models USING btree (brand_id, name);


--
-- Name: vehicle_models_class_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vehicle_models_class_idx ON public.vehicle_models USING btree (class_id) WHERE (class_id IS NOT NULL);


--
-- Name: vehicle_models_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vehicle_models_pending_idx ON public.vehicle_models USING btree (status) WHERE (status = 'pending'::text);


--
-- Name: wtb_listings_attributes_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wtb_listings_attributes_idx ON public.wtb_listings USING gin (attributes);


--
-- Name: wtb_listings_category_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wtb_listings_category_id_idx ON public.wtb_listings USING btree (category_id);


--
-- Name: wtb_listings_search_vector_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wtb_listings_search_vector_idx ON public.wtb_listings USING gin (search_vector);


--
-- Name: wtb_listings_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wtb_listings_status_idx ON public.wtb_listings USING btree (status);


--
-- Name: wtb_listings_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wtb_listings_user_id_idx ON public.wtb_listings USING btree (user_id);


--
-- Name: app_settings app_settings_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER app_settings_set_updated_at BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: categories categories_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER categories_set_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: category_filters category_filters_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER category_filters_set_updated_at BEFORE UPDATE ON public.category_filters FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: category_filters category_filters_sync_synonyms; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER category_filters_sync_synonyms AFTER INSERT OR UPDATE OF options, type, label_nb ON public.category_filters FOR EACH ROW EXECUTE FUNCTION public.sync_filter_synonyms_from_options();


--
-- Name: category_flows category_flows_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER category_flows_set_updated_at BEFORE UPDATE ON public.category_flows FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: conversations conversations_enforce_block_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER conversations_enforce_block_trigger BEFORE INSERT ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.conversations_enforce_block();


--
-- Name: conversations conversations_enforce_moderation_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER conversations_enforce_moderation_trg BEFORE INSERT ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.conversations_enforce_moderation();


--
-- Name: conversations conversations_enforce_read_status_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER conversations_enforce_read_status_only BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.enforce_conversation_read_status_only();


--
-- Name: messages dispatch_push_after_message_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dispatch_push_after_message_insert AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.dispatch_push_for_message();


--
-- Name: favorite_price_drops dispatch_push_after_price_drop_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dispatch_push_after_price_drop_insert AFTER INSERT ON public.favorite_price_drops FOR EACH ROW EXECUTE FUNCTION public.dispatch_push_for_price_drop();


--
-- Name: saved_search_notifications dispatch_push_after_saved_search_notification_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dispatch_push_after_saved_search_notification_insert AFTER INSERT ON public.saved_search_notifications FOR EACH ROW EXECUTE FUNCTION public.dispatch_push_for_saved_search();


--
-- Name: favorite_sold_notifications dispatch_push_after_sold_notification_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER dispatch_push_after_sold_notification_insert AFTER INSERT ON public.favorite_sold_notifications FOR EACH ROW EXECUTE FUNCTION public.dispatch_push_for_sold();


--
-- Name: filter_synonyms filter_synonyms_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER filter_synonyms_set_updated_at BEFORE UPDATE ON public.filter_synonyms FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: listing_promotions listing_promotions_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER listing_promotions_set_updated_at BEFORE UPDATE ON public.listing_promotions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: listing_sales listing_sales_sync_status_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER listing_sales_sync_status_trigger AFTER INSERT OR DELETE ON public.listing_sales FOR EACH ROW EXECUTE FUNCTION public.listing_sales_sync_status();


--
-- Name: listing_sales listing_sales_validate_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER listing_sales_validate_trigger BEFORE INSERT ON public.listing_sales FOR EACH ROW EXECUTE FUNCTION public.listing_sales_validate();


--
-- Name: listings listings_emit_price_drops; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER listings_emit_price_drops AFTER UPDATE OF price_nok ON public.listings FOR EACH ROW EXECUTE FUNCTION public.listings_emit_price_drops();


--
-- Name: listings listings_emit_sold_notifications; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER listings_emit_sold_notifications AFTER UPDATE OF status ON public.listings FOR EACH ROW EXECUTE FUNCTION public.listings_emit_sold_notifications();


--
-- Name: listings listings_enforce_moderation_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER listings_enforce_moderation_trg BEFORE INSERT ON public.listings FOR EACH ROW EXECUTE FUNCTION public.listings_enforce_moderation();


--
-- Name: listings listings_expire_promotions_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER listings_expire_promotions_trg AFTER UPDATE OF status ON public.listings FOR EACH ROW EXECUTE FUNCTION public.listings_expire_promotions();


--
-- Name: listings listings_fuzz_location; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER listings_fuzz_location BEFORE INSERT OR UPDATE OF lat, lng ON public.listings FOR EACH ROW EXECUTE FUNCTION public.fuzz_listing_location();


--
-- Name: listings listings_match_saved_searches; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER listings_match_saved_searches AFTER INSERT OR UPDATE OF status, price_nok, is_free, category_id, condition ON public.listings FOR EACH ROW EXECUTE FUNCTION public.listings_match_saved_searches_trigger();


--
-- Name: listings listings_remove_category_word_stats_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER listings_remove_category_word_stats_trigger AFTER DELETE ON public.listings FOR EACH ROW EXECUTE FUNCTION public.listings_remove_category_word_stats();


--
-- Name: listings listings_remove_keyword_stats_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER listings_remove_keyword_stats_trigger AFTER DELETE ON public.listings FOR EACH ROW EXECUTE FUNCTION public.listings_remove_keyword_stats();


--
-- Name: listings listings_search_vector_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER listings_search_vector_update BEFORE INSERT OR UPDATE OF title, description, city, attributes ON public.listings FOR EACH ROW EXECUTE FUNCTION public.listings_search_vector_trigger();


--
-- Name: listings listings_set_expiry_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER listings_set_expiry_trigger BEFORE INSERT OR UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION public.listings_set_expiry();


--
-- Name: listings listings_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER listings_set_updated_at BEFORE UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: listings listings_update_category_word_stats_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER listings_update_category_word_stats_trigger BEFORE INSERT OR UPDATE OF status, category_id, title ON public.listings FOR EACH ROW EXECUTE FUNCTION public.listings_update_category_word_stats();


--
-- Name: listings listings_update_keyword_stats_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER listings_update_keyword_stats_trigger BEFORE INSERT OR UPDATE OF status, category_id, title ON public.listings FOR EACH ROW EXECUTE FUNCTION public.listings_update_keyword_stats();


--
-- Name: messages messages_bump_conversation_last_message_at_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER messages_bump_conversation_last_message_at_trg AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.messages_bump_conversation_last_message_at();


--
-- Name: messages messages_enforce_block_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER messages_enforce_block_trigger BEFORE INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.messages_enforce_block();


--
-- Name: messages messages_enforce_moderation_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER messages_enforce_moderation_trg BEFORE INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.messages_enforce_moderation();


--
-- Name: messages messages_enforce_soft_delete_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER messages_enforce_soft_delete_only BEFORE UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.enforce_message_soft_delete_only();


--
-- Name: notification_preferences notification_preferences_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notification_preferences_set_updated_at BEFORE UPDATE ON public.notification_preferences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: profiles profiles_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: promotion_pricing promotion_pricing_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER promotion_pricing_set_updated_at BEFORE UPDATE ON public.promotion_pricing FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: saved_searches saved_searches_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER saved_searches_updated_at BEFORE UPDATE ON public.saved_searches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: user_reviews user_reviews_validate_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER user_reviews_validate_trigger BEFORE INSERT ON public.user_reviews FOR EACH ROW EXECUTE FUNCTION public.user_reviews_validate();


--
-- Name: vipps_webhook_secrets vipps_webhook_secrets_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vipps_webhook_secrets_set_updated_at BEFORE UPDATE ON public.vipps_webhook_secrets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: wtb_listings wtb_listings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wtb_listings_updated_at BEFORE UPDATE ON public.wtb_listings FOR EACH ROW EXECUTE FUNCTION public.update_wtb_listings_updated_at();


--
-- Name: account_deletions account_deletions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_deletions
    ADD CONSTRAINT account_deletions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: categories categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- Name: category_filters category_filters_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_filters
    ADD CONSTRAINT category_filters_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;


--
-- Name: category_flows category_flows_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_flows
    ADD CONSTRAINT category_flows_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;


--
-- Name: category_sync_status category_sync_status_last_synced_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_sync_status
    ADD CONSTRAINT category_sync_status_last_synced_by_fkey FOREIGN KEY (last_synced_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.profiles(id);


--
-- Name: conversations conversations_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.profiles(id);


--
-- Name: conversations conversations_wtb_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_wtb_listing_id_fkey FOREIGN KEY (wtb_listing_id) REFERENCES public.wtb_listings(id);


--
-- Name: favorite_price_drops favorite_price_drops_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorite_price_drops
    ADD CONSTRAINT favorite_price_drops_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: favorite_price_drops favorite_price_drops_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorite_price_drops
    ADD CONSTRAINT favorite_price_drops_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: favorite_sold_notifications favorite_sold_notifications_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorite_sold_notifications
    ADD CONSTRAINT favorite_sold_notifications_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: favorite_sold_notifications favorite_sold_notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorite_sold_notifications
    ADD CONSTRAINT favorite_sold_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: favorites favorites_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: favorites favorites_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: filter_synonyms filter_synonyms_category_filter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.filter_synonyms
    ADD CONSTRAINT filter_synonyms_category_filter_id_fkey FOREIGN KEY (category_filter_id) REFERENCES public.category_filters(id) ON DELETE CASCADE;


--
-- Name: listing_360_capture_sessions listing_360_capture_sessions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_360_capture_sessions
    ADD CONSTRAINT listing_360_capture_sessions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: listing_360_capture_sessions listing_360_capture_sessions_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_360_capture_sessions
    ADD CONSTRAINT listing_360_capture_sessions_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: listing_360_frames listing_360_frames_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_360_frames
    ADD CONSTRAINT listing_360_frames_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: listing_category_word_stats listing_category_word_stats_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_category_word_stats
    ADD CONSTRAINT listing_category_word_stats_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;


--
-- Name: listing_images listing_images_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_images
    ADD CONSTRAINT listing_images_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: listing_keyword_stats listing_keyword_stats_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_keyword_stats
    ADD CONSTRAINT listing_keyword_stats_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;


--
-- Name: listing_promotions listing_promotions_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_promotions
    ADD CONSTRAINT listing_promotions_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: listing_promotions listing_promotions_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_promotions
    ADD CONSTRAINT listing_promotions_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: listing_promotions listing_promotions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listing_promotions
    ADD CONSTRAINT listing_promotions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: listings listings_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listings
    ADD CONSTRAINT listings_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- Name: listings listings_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.listings
    ADD CONSTRAINT listings_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: reports reports_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE SET NULL;


--
-- Name: reports reports_reported_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_reported_user_id_fkey FOREIGN KEY (reported_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: reports reports_reporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: reports reports_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES auth.users(id);


--
-- Name: saved_search_notifications saved_search_notifications_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_search_notifications
    ADD CONSTRAINT saved_search_notifications_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;


--
-- Name: saved_search_notifications saved_search_notifications_saved_search_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_search_notifications
    ADD CONSTRAINT saved_search_notifications_saved_search_id_fkey FOREIGN KEY (saved_search_id) REFERENCES public.saved_searches(id) ON DELETE CASCADE;


--
-- Name: saved_search_notifications saved_search_notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_search_notifications
    ADD CONSTRAINT saved_search_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: saved_searches saved_searches_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_searches
    ADD CONSTRAINT saved_searches_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: system_messages system_messages_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_messages
    ADD CONSTRAINT system_messages_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: vehicle_brands vehicle_brands_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_brands
    ADD CONSTRAINT vehicle_brands_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: vehicle_lookup_log vehicle_lookup_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_lookup_log
    ADD CONSTRAINT vehicle_lookup_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: vehicle_model_classes vehicle_model_classes_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_model_classes
    ADD CONSTRAINT vehicle_model_classes_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.vehicle_brands(id) ON DELETE CASCADE;


--
-- Name: vehicle_model_classes vehicle_model_classes_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_model_classes
    ADD CONSTRAINT vehicle_model_classes_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: vehicle_models vehicle_models_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_models
    ADD CONSTRAINT vehicle_models_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.vehicle_brands(id) ON DELETE CASCADE;


--
-- Name: vehicle_models vehicle_models_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_models
    ADD CONSTRAINT vehicle_models_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.vehicle_model_classes(id) ON DELETE SET NULL;


--
-- Name: vehicle_models vehicle_models_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_models
    ADD CONSTRAINT vehicle_models_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: wtb_listings wtb_listings_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wtb_listings
    ADD CONSTRAINT wtb_listings_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id);


--
-- Name: wtb_listings wtb_listings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wtb_listings
    ADD CONSTRAINT wtb_listings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: listings Active listings are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Active listings are viewable by everyone" ON public.listings FOR SELECT USING (((status = 'active'::public.listing_status) OR (auth.uid() = seller_id)));


--
-- Name: system_messages Admins and moderators can insert system messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and moderators can insert system messages" ON public.system_messages FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND ((user_roles.role)::text = ANY (ARRAY['admin'::text, 'moderator'::text]))))));


--
-- Name: reports Admins and moderators can update reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and moderators can update reports" ON public.reports FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND ((user_roles.role)::text = ANY (ARRAY['admin'::text, 'moderator'::text]))))));


--
-- Name: reports Admins and moderators can view reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and moderators can view reports" ON public.reports FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND ((user_roles.role)::text = ANY (ARRAY['admin'::text, 'moderator'::text]))))));


--
-- Name: admin_moderation_log Admins and moderators read moderation log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and moderators read moderation log" ON public.admin_moderation_log FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND ((user_roles.role)::text = ANY (ARRAY['admin'::text, 'moderator'::text]))))));


--
-- Name: categories Admins can delete categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete categories" ON public.categories FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: category_filters Admins can delete category filters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete category filters" ON public.category_filters FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: category_flows Admins can delete category flows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete category flows" ON public.category_flows FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: filter_synonyms Admins can delete filter synonyms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete filter synonyms" ON public.filter_synonyms FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: categories Admins can insert categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert categories" ON public.categories FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: category_filters Admins can insert category filters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert category filters" ON public.category_filters FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: category_flows Admins can insert category flows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert category flows" ON public.category_flows FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: filter_synonyms Admins can insert filter synonyms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert filter synonyms" ON public.filter_synonyms FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Admins can manage roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage roles" ON public.user_roles TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: categories Admins can update categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update categories" ON public.categories FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: category_filters Admins can update category filters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update category filters" ON public.category_filters FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: category_flows Admins can update category flows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update category flows" ON public.category_flows FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: filter_synonyms Admins can update filter synonyms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update filter synonyms" ON public.filter_synonyms FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: reports Admins can update reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update reports" ON public.reports FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: site_settings Admins can update site settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update site settings" ON public.site_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: listings Admins can view all listings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all listings" ON public.listings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: category_sync_status Admins can view category sync status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view category sync status" ON public.category_sync_status FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: listing_view_events Admins can view listing view events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view listing view events" ON public.listing_view_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: listing_views Admins can view listing views; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view listing views" ON public.listing_views FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: reports Admins can view reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view reports" ON public.reports FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: ip_bans Admins manage ip_bans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage ip_bans" ON public.ip_bans TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: promotion_pricing Admins manage pricing; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage pricing" ON public.promotion_pricing TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: listing_promotions Admins manage promotions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage promotions" ON public.listing_promotions TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_bans Admins manage user_bans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage user_bans" ON public.user_bans TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_suspensions Admins manage user_suspensions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage user_suspensions" ON public.user_suspensions TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: vipps_webhook_events Admins read webhook events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read webhook events" ON public.vipps_webhook_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: listing_views Anyone can log a view for an active listing; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can log a view for an active listing" ON public.listing_views FOR INSERT TO authenticated, anon WITH CHECK ((EXISTS ( SELECT 1
   FROM public.listings l
  WHERE ((l.id = listing_views.listing_id) AND (l.status = 'active'::public.listing_status)))));


--
-- Name: promotion_pricing Anyone can read active pricing; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read active pricing" ON public.promotion_pricing FOR SELECT USING ((active = true));


--
-- Name: wtb_listings Anyone can read active wtb listings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read active wtb listings" ON public.wtb_listings FOR SELECT USING ((status = 'active'::text));


--
-- Name: user_reviews Authenticated user can create own review; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated user can create own review" ON public.user_reviews FOR INSERT TO authenticated WITH CHECK ((auth.uid() = reviewer_id));


--
-- Name: vehicle_brands Authenticated users can propose vehicle brands; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can propose vehicle brands" ON public.vehicle_brands FOR INSERT TO authenticated WITH CHECK (((status = 'pending'::text) AND (submitted_by = auth.uid())));


--
-- Name: vehicle_model_classes Authenticated users can propose vehicle model classes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can propose vehicle model classes" ON public.vehicle_model_classes FOR INSERT TO authenticated WITH CHECK (((status = 'pending'::text) AND (submitted_by = auth.uid())));


--
-- Name: vehicle_models Authenticated users can propose vehicle models; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can propose vehicle models" ON public.vehicle_models FOR INSERT TO authenticated WITH CHECK (((status = 'pending'::text) AND (submitted_by = auth.uid())));


--
-- Name: reports Authenticated users can submit reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can submit reports" ON public.reports FOR INSERT TO authenticated WITH CHECK ((auth.uid() = reporter_id));


--
-- Name: conversations Buyers can start conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Buyers can start conversations" ON public.conversations FOR INSERT TO authenticated WITH CHECK (((auth.uid() = buyer_id) AND (auth.uid() <> seller_id) AND (EXISTS ( SELECT 1
   FROM public.listings l
  WHERE ((l.id = conversations.listing_id) AND (l.seller_id = conversations.seller_id) AND (l.status = 'active'::public.listing_status))))));


--
-- Name: listing_images Buyers can view images of purchased listings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Buyers can view images of purchased listings" ON public.listing_images FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.listing_sales s
  WHERE ((s.listing_id = listing_images.listing_id) AND (s.buyer_id = auth.uid())))));


--
-- Name: listings Buyers can view their purchased listings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Buyers can view their purchased listings" ON public.listings FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.listing_sales s
  WHERE ((s.listing_id = listings.id) AND (s.buyer_id = auth.uid())))));


--
-- Name: categories Categories are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Categories are viewable by everyone" ON public.categories FOR SELECT USING (true);


--
-- Name: category_filters Category filters are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Category filters are viewable by everyone" ON public.category_filters FOR SELECT USING (true);


--
-- Name: category_flows Category flows are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Category flows are viewable by everyone" ON public.category_flows FOR SELECT USING (true);


--
-- Name: listing_category_word_stats Category word stats are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Category word stats are viewable by everyone" ON public.listing_category_word_stats FOR SELECT USING (true);


--
-- Name: filter_synonyms Filter synonyms are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Filter synonyms are viewable by everyone" ON public.filter_synonyms FOR SELECT USING (true);


--
-- Name: listing_keyword_stats Keyword stats are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Keyword stats are viewable by everyone" ON public.listing_keyword_stats FOR SELECT USING (true);


--
-- Name: listing_360_frames Listing 360 frames viewable for active or owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Listing 360 frames viewable for active or owner" ON public.listing_360_frames FOR SELECT TO authenticated, anon USING ((EXISTS ( SELECT 1
   FROM public.listings l
  WHERE ((l.id = listing_360_frames.listing_id) AND ((l.status = 'active'::public.listing_status) OR (l.seller_id = auth.uid()))))));


--
-- Name: listing_images Listing images viewable for active or owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Listing images viewable for active or owner" ON public.listing_images FOR SELECT TO authenticated, anon USING ((EXISTS ( SELECT 1
   FROM public.listings l
  WHERE ((l.id = listing_images.listing_id) AND ((l.status = 'active'::public.listing_status) OR (l.seller_id = auth.uid()))))));


--
-- Name: listing_360_frames Owners can manage listing 360 frames; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can manage listing 360 frames" ON public.listing_360_frames TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.listings l
  WHERE ((l.id = listing_360_frames.listing_id) AND (l.seller_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.listings l
  WHERE ((l.id = listing_360_frames.listing_id) AND (l.seller_id = auth.uid())))));


--
-- Name: listing_images Owners can manage listing images; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can manage listing images" ON public.listing_images TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.listings l
  WHERE ((l.id = listing_images.listing_id) AND (l.seller_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.listings l
  WHERE ((l.id = listing_images.listing_id) AND (l.seller_id = auth.uid())))));


--
-- Name: listing_promotions Owners can read own promotions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can read own promotions" ON public.listing_promotions FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: messages Participants can send messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Participants can send messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (((auth.uid() = sender_id) AND (EXISTS ( SELECT 1
   FROM public.conversations c
  WHERE ((c.id = messages.conversation_id) AND ((c.buyer_id = auth.uid()) OR (c.seller_id = auth.uid())))))));


--
-- Name: conversations Participants can update conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Participants can update conversations" ON public.conversations FOR UPDATE TO authenticated USING (((auth.uid() = buyer_id) OR (auth.uid() = seller_id))) WITH CHECK ((((auth.uid() = buyer_id) OR (auth.uid() = seller_id)) AND (buyer_id = ( SELECT c.buyer_id
   FROM public.conversations c
  WHERE (c.id = conversations.id))) AND (seller_id = ( SELECT c.seller_id
   FROM public.conversations c
  WHERE (c.id = conversations.id))) AND (listing_id = ( SELECT c.listing_id
   FROM public.conversations c
  WHERE (c.id = conversations.id)))));


--
-- Name: conversations Participants can view conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Participants can view conversations" ON public.conversations FOR SELECT TO authenticated USING (((auth.uid() = buyer_id) OR (auth.uid() = seller_id)));


--
-- Name: listing_sales Participants can view listing sales; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Participants can view listing sales" ON public.listing_sales FOR SELECT TO authenticated USING (((auth.uid() = buyer_id) OR (auth.uid() = seller_id)));


--
-- Name: messages Participants can view messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Participants can view messages" ON public.messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.conversations c
  WHERE ((c.id = messages.conversation_id) AND ((c.buyer_id = auth.uid()) OR (c.seller_id = auth.uid()))))));


--
-- Name: profiles Profiles are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (((deleted_at IS NULL) OR (auth.uid() = id)));


--
-- Name: user_reviews Reviews are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Reviews are viewable by everyone" ON public.user_reviews FOR SELECT USING (true);


--
-- Name: listing_sales Seller can confirm sale; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Seller can confirm sale" ON public.listing_sales FOR INSERT TO authenticated WITH CHECK (((auth.uid() = seller_id) AND (EXISTS ( SELECT 1
   FROM public.conversations c
  WHERE ((c.id = listing_sales.conversation_id) AND (c.seller_id = listing_sales.seller_id) AND (c.buyer_id = listing_sales.buyer_id) AND (c.listing_id = listing_sales.listing_id))))));


--
-- Name: listing_sales Seller can undo sale; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Seller can undo sale" ON public.listing_sales FOR DELETE TO authenticated USING ((auth.uid() = seller_id));


--
-- Name: messages Senders can soft-delete their own messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Senders can soft-delete their own messages" ON public.messages FOR UPDATE TO authenticated USING ((auth.uid() = sender_id)) WITH CHECK ((auth.uid() = sender_id));


--
-- Name: site_settings Site settings are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Site settings are viewable by everyone" ON public.site_settings FOR SELECT USING (true);


--
-- Name: listings Users can delete their own listings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own listings" ON public.listings FOR DELETE TO authenticated USING ((auth.uid() = seller_id));


--
-- Name: favorite_price_drops Users can delete their own price drops; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own price drops" ON public.favorite_price_drops FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: favorite_sold_notifications Users can delete their own sold notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own sold notifications" ON public.favorite_sold_notifications FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: wtb_listings Users can delete their own wtb listings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own wtb listings" ON public.wtb_listings FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: listings Users can insert their own listings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own listings" ON public.listings FOR INSERT TO authenticated WITH CHECK ((auth.uid() = seller_id));


--
-- Name: profiles Users can insert their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((auth.uid() = id));


--
-- Name: wtb_listings Users can insert their own wtb listings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own wtb listings" ON public.wtb_listings FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: favorites Users can manage their own favorites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their own favorites" ON public.favorites TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: system_messages Users can mark their system messages as read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can mark their system messages as read" ON public.system_messages FOR UPDATE TO authenticated USING ((auth.uid() = recipient_id));


--
-- Name: wtb_listings Users can read their own wtb listings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read their own wtb listings" ON public.wtb_listings FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: listings Users can update their own listings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own listings" ON public.listings FOR UPDATE TO authenticated USING (((auth.uid() = seller_id) AND (status <> 'disabled'::public.listing_status))) WITH CHECK (((auth.uid() = seller_id) AND (status <> 'disabled'::public.listing_status)));


--
-- Name: favorite_price_drops Users can update their own price drops; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own price drops" ON public.favorite_price_drops FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: profiles Users can update their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = id));


--
-- Name: favorite_sold_notifications Users can update their own sold notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own sold notifications" ON public.favorite_sold_notifications FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: wtb_listings Users can update their own wtb listings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own wtb listings" ON public.wtb_listings FOR UPDATE USING ((user_id = auth.uid()));


--
-- Name: user_roles Users can view own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: favorite_price_drops Users can view their own price drops; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own price drops" ON public.favorite_price_drops FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: favorite_sold_notifications Users can view their own sold notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own sold notifications" ON public.favorite_sold_notifications FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: system_messages Users can view their own system messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own system messages" ON public.system_messages FOR SELECT TO authenticated USING ((auth.uid() = recipient_id));


--
-- Name: user_blocks Users delete own blocks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users delete own blocks" ON public.user_blocks FOR DELETE TO authenticated USING ((auth.uid() = blocker_id));


--
-- Name: account_deletions Users delete own deletion request; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users delete own deletion request" ON public.account_deletions FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: saved_search_notifications Users delete own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users delete own notifications" ON public.saved_search_notifications FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: user_blocks Users insert own blocks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users insert own blocks" ON public.user_blocks FOR INSERT TO authenticated WITH CHECK ((auth.uid() = blocker_id));


--
-- Name: notification_preferences Users insert own notification preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users insert own notification preferences" ON public.notification_preferences FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: push_subscriptions Users manage own push subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own push subscriptions" ON public.push_subscriptions TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: saved_searches Users manage own saved searches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own saved searches" ON public.saved_searches TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_bans Users see own ban; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users see own ban" ON public.user_bans FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: user_suspensions Users see own suspensions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users see own suspensions" ON public.user_suspensions FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: notification_preferences Users update own notification preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update own notification preferences" ON public.notification_preferences FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: saved_search_notifications Users update own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update own notifications" ON public.saved_search_notifications FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_blocks Users view own blocks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own blocks" ON public.user_blocks FOR SELECT TO authenticated USING ((auth.uid() = blocker_id));


--
-- Name: account_deletions Users view own deletion request; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own deletion request" ON public.account_deletions FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: notification_preferences Users view own notification preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own notification preferences" ON public.notification_preferences FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: saved_search_notifications Users view own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own notifications" ON public.saved_search_notifications FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: vehicle_brands Vehicle brands are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Vehicle brands are viewable by everyone" ON public.vehicle_brands FOR SELECT USING (true);


--
-- Name: vehicle_model_classes Vehicle model classes are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Vehicle model classes are viewable by everyone" ON public.vehicle_model_classes FOR SELECT USING (true);


--
-- Name: vehicle_models Vehicle models are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Vehicle models are viewable by everyone" ON public.vehicle_models FOR SELECT USING (true);


--
-- Name: account_deletions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account_deletions ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_moderation_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_moderation_log ENABLE ROW LEVEL SECURITY;

--
-- Name: app_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

--
-- Name: category_filters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.category_filters ENABLE ROW LEVEL SECURITY;

--
-- Name: category_flows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.category_flows ENABLE ROW LEVEL SECURITY;

--
-- Name: category_sync_status; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.category_sync_status ENABLE ROW LEVEL SECURITY;

--
-- Name: conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: error_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.error_log ENABLE ROW LEVEL SECURITY;

--
-- Name: favorite_price_drops; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.favorite_price_drops ENABLE ROW LEVEL SECURITY;

--
-- Name: favorite_sold_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.favorite_sold_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: favorites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

--
-- Name: filter_synonyms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.filter_synonyms ENABLE ROW LEVEL SECURITY;

--
-- Name: ip_bans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ip_bans ENABLE ROW LEVEL SECURITY;

--
-- Name: listing_360_capture_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.listing_360_capture_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: listing_360_frames; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.listing_360_frames ENABLE ROW LEVEL SECURITY;

--
-- Name: listing_category_word_stats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.listing_category_word_stats ENABLE ROW LEVEL SECURITY;

--
-- Name: listing_images; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.listing_images ENABLE ROW LEVEL SECURITY;

--
-- Name: listing_keyword_stats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.listing_keyword_stats ENABLE ROW LEVEL SECURITY;

--
-- Name: listing_promotions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.listing_promotions ENABLE ROW LEVEL SECURITY;

--
-- Name: listing_sales; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.listing_sales ENABLE ROW LEVEL SECURITY;

--
-- Name: listing_view_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.listing_view_events ENABLE ROW LEVEL SECURITY;

--
-- Name: listing_views; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.listing_views ENABLE ROW LEVEL SECURITY;

--
-- Name: listings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: promotion_pricing; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promotion_pricing ENABLE ROW LEVEL SECURITY;

--
-- Name: push_dispatch_failures; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_dispatch_failures ENABLE ROW LEVEL SECURITY;

--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

--
-- Name: saved_search_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.saved_search_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: saved_searches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;

--
-- Name: search_query_stats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.search_query_stats ENABLE ROW LEVEL SECURITY;

--
-- Name: site_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: system_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.system_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: user_bans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_bans ENABLE ROW LEVEL SECURITY;

--
-- Name: user_blocks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

--
-- Name: user_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_suspensions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_suspensions ENABLE ROW LEVEL SECURITY;

--
-- Name: vehicle_brands; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vehicle_brands ENABLE ROW LEVEL SECURITY;

--
-- Name: vehicle_lookup_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vehicle_lookup_log ENABLE ROW LEVEL SECURITY;

--
-- Name: vehicle_model_classes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vehicle_model_classes ENABLE ROW LEVEL SECURITY;

--
-- Name: vehicle_models; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vehicle_models ENABLE ROW LEVEL SECURITY;

--
-- Name: vipps_webhook_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vipps_webhook_events ENABLE ROW LEVEL SECURITY;

--
-- Name: vipps_webhook_secrets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vipps_webhook_secrets ENABLE ROW LEVEL SECURITY;

--
-- Name: wtb_listings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wtb_listings ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--



-- Non-public objects created by migrations that pg_dump --schema=public
-- does not capture.

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO storage.buckets (id, name, public) VALUES
  ('listing-images', 'listing-images', false),
  ('avatars', 'avatars', true),
  ('listing-360-frames', 'listing-360-frames', false)
ON CONFLICT (id) DO NOTHING;

SELECT cron.schedule('purge-expired-accounts-daily', '0 3 * * *', 'SELECT public.purge_expired_accounts();');
