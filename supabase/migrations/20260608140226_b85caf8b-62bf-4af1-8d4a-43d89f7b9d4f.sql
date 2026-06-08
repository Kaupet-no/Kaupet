
-- Pricing table
CREATE TABLE public.promotion_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  duration_days int NOT NULL UNIQUE CHECK (duration_days > 0),
  price_nok int NOT NULL CHECK (price_nok >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.promotion_pricing TO authenticated, anon;
GRANT ALL ON public.promotion_pricing TO service_role;
ALTER TABLE public.promotion_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read active pricing" ON public.promotion_pricing
  FOR SELECT USING (active = true);
CREATE POLICY "Admins manage pricing" ON public.promotion_pricing
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER promotion_pricing_set_updated_at
  BEFORE UPDATE ON public.promotion_pricing
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.promotion_pricing (duration_days, price_nok) VALUES (3, 49), (5, 69);

-- Promotions table
CREATE TYPE public.promotion_status AS ENUM ('pending','active','expired','failed','refunded','gifted');

CREATE TABLE public.listing_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  duration_days int NOT NULL CHECK (duration_days > 0),
  price_nok int NOT NULL CHECK (price_nok >= 0),
  status public.promotion_status NOT NULL DEFAULT 'pending',
  is_gift boolean NOT NULL DEFAULT false,
  gift_reason text,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  vipps_reference text UNIQUE,
  vipps_psp_reference text,
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_listing_promotions_active ON public.listing_promotions (status, expires_at);
CREATE INDEX idx_listing_promotions_listing ON public.listing_promotions (listing_id);
CREATE INDEX idx_listing_promotions_user ON public.listing_promotions (user_id);
CREATE UNIQUE INDEX uniq_active_promotion_per_listing
  ON public.listing_promotions (listing_id)
  WHERE status IN ('active','pending','gifted');

GRANT SELECT, INSERT, UPDATE ON public.listing_promotions TO authenticated;
GRANT ALL ON public.listing_promotions TO service_role;
ALTER TABLE public.listing_promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can read own promotions" ON public.listing_promotions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Anyone can read active promotions" ON public.listing_promotions
  FOR SELECT USING (status IN ('active','gifted') AND expires_at > now());
CREATE POLICY "Admins manage promotions" ON public.listing_promotions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.listing_promotions TO anon;

CREATE TRIGGER listing_promotions_set_updated_at
  BEFORE UPDATE ON public.listing_promotions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Webhook idempotency log
CREATE TABLE public.vipps_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE NOT NULL,
  reference text,
  event_name text,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
GRANT ALL ON public.vipps_webhook_events TO service_role;
ALTER TABLE public.vipps_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read webhook events" ON public.vipps_webhook_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Trigger: expire promotion when listing leaves active
CREATE OR REPLACE FUNCTION public.listings_expire_promotions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status <> 'active' AND OLD.status = 'active' THEN
    UPDATE public.listing_promotions
       SET status = 'expired'
     WHERE listing_id = NEW.id AND status IN ('active','gifted');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER listings_expire_promotions_trg
  AFTER UPDATE OF status ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.listings_expire_promotions();

-- Expiry job
CREATE OR REPLACE FUNCTION public.expire_listing_promotions()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

-- Featured listing ids helper
CREATE OR REPLACE FUNCTION public.get_featured_listing_ids(_category_slug text DEFAULT NULL, _limit int DEFAULT 2)
RETURNS TABLE(listing_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
