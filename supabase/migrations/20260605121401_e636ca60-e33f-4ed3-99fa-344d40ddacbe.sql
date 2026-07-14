
-- ============== listing_sales ==============
CREATE TABLE public.listing_sales (
  listing_id uuid PRIMARY KEY,
  seller_id uuid NOT NULL,
  buyer_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX listing_sales_buyer_idx ON public.listing_sales (buyer_id);
CREATE INDEX listing_sales_seller_idx ON public.listing_sales (seller_id);

GRANT SELECT, INSERT, DELETE ON public.listing_sales TO authenticated;
GRANT SELECT ON public.listing_sales TO anon;
GRANT ALL ON public.listing_sales TO service_role;

ALTER TABLE public.listing_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Listing sales viewable by everyone"
  ON public.listing_sales FOR SELECT
  USING (true);

CREATE POLICY "Seller can confirm sale"
  ON public.listing_sales FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "Seller can undo sale"
  ON public.listing_sales FOR DELETE
  TO authenticated
  USING (auth.uid() = seller_id);

-- Validate sale row matches the conversation and listing
CREATE OR REPLACE FUNCTION public.listing_sales_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE TRIGGER listing_sales_validate_trigger
BEFORE INSERT ON public.listing_sales
FOR EACH ROW EXECUTE FUNCTION public.listing_sales_validate();

-- Mark listing as sold when sale confirmed; restore to active when undone
CREATE OR REPLACE FUNCTION public.listing_sales_sync_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE TRIGGER listing_sales_sync_status_trigger
AFTER INSERT OR DELETE ON public.listing_sales
FOR EACH ROW EXECUTE FUNCTION public.listing_sales_sync_status();

-- ============== user_reviews ==============
CREATE TABLE public.user_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL,
  reviewer_id uuid NOT NULL,
  reviewee_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('buyer','seller')),
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text CHECK (comment IS NULL OR length(comment) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id, reviewer_id),
  CHECK (reviewer_id <> reviewee_id)
);

CREATE INDEX user_reviews_reviewee_idx ON public.user_reviews (reviewee_id, created_at DESC);
CREATE INDEX user_reviews_listing_idx ON public.user_reviews (listing_id);

GRANT SELECT, INSERT ON public.user_reviews TO authenticated;
GRANT SELECT ON public.user_reviews TO anon;
GRANT ALL ON public.user_reviews TO service_role;

ALTER TABLE public.user_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviews viewable by everyone"
  ON public.user_reviews FOR SELECT
  USING (true);

CREATE POLICY "Authenticated user can create own review"
  ON public.user_reviews FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reviewer_id);

-- Validate that reviewer/reviewee match a confirmed sale and role is correct
CREATE OR REPLACE FUNCTION public.user_reviews_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE TRIGGER user_reviews_validate_trigger
BEFORE INSERT ON public.user_reviews
FOR EACH ROW EXECUTE FUNCTION public.user_reviews_validate();

-- ============== summary helper ==============
CREATE OR REPLACE FUNCTION public.user_review_summary(_user_id uuid)
RETURNS TABLE(avg_rating numeric, review_count integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    COALESCE(ROUND(AVG(rating)::numeric, 2), 0)::numeric AS avg_rating,
    COUNT(*)::int AS review_count
  FROM public.user_reviews
  WHERE reviewee_id = _user_id;
$$;

GRANT EXECUTE ON FUNCTION public.user_review_summary(uuid) TO anon, authenticated;
