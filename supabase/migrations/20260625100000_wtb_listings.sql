-- Ønskes kjøpt-annonser
CREATE TABLE IF NOT EXISTS wtb_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id),
  title text NOT NULL CHECK (char_length(trim(title)) >= 3 AND char_length(trim(title)) <= 120),
  description text CHECK (description IS NULL OR char_length(trim(description)) <= 2000),
  category_id uuid REFERENCES categories,
  max_price_nok integer CHECK (max_price_nok IS NULL OR (max_price_nok >= 0 AND max_price_nok <= 10000000)),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'fulfilled', 'expired', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '90 days'
);

-- Full-text search index (Norwegian)
ALTER TABLE wtb_listings
  ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
      to_tsvector('norwegian', coalesce(title, '') || ' ' || coalesce(description, ''))
    ) STORED;

CREATE INDEX wtb_listings_search_vector_idx ON wtb_listings USING gin(search_vector);
CREATE INDEX wtb_listings_category_id_idx ON wtb_listings (category_id);
CREATE INDEX wtb_listings_status_idx ON wtb_listings (status);
CREATE INDEX wtb_listings_user_id_idx ON wtb_listings (user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_wtb_listings_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER wtb_listings_updated_at
  BEFORE UPDATE ON wtb_listings
  FOR EACH ROW EXECUTE FUNCTION update_wtb_listings_updated_at();

-- RLS
ALTER TABLE wtb_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active wtb listings"
  ON wtb_listings FOR SELECT
  USING (status = 'active');

CREATE POLICY "Users can read their own wtb listings"
  ON wtb_listings FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own wtb listings"
  ON wtb_listings FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own wtb listings"
  ON wtb_listings FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own wtb listings"
  ON wtb_listings FOR DELETE
  USING (user_id = auth.uid());

-- Allow conversations to reference WTB listings
-- Make listing_id nullable so WTB conversations can exist
ALTER TABLE conversations ALTER COLUMN listing_id DROP NOT NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS wtb_listing_id uuid REFERENCES wtb_listings;
ALTER TABLE conversations ADD CONSTRAINT conversations_has_listing
  CHECK (listing_id IS NOT NULL OR wtb_listing_id IS NOT NULL);
