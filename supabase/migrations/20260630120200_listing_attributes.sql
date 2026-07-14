-- Free-form attribute values for listings and wanted-to-buy listings. Keys match
-- public.category_filters.key for the listing's category (and inherited parent
-- filters). Values are stored as JSONB, e.g. { "tv_size_inch": 55, "screen_tech": "oled" }.

ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS listings_attributes_idx ON public.listings USING GIN (attributes);

ALTER TABLE public.wtb_listings ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS wtb_listings_attributes_idx ON public.wtb_listings USING GIN (attributes);
