-- Remove duplicates, keep earliest row per (listing_id, visitor_key)
DELETE FROM public.listing_views a
USING public.listing_views b
WHERE a.listing_id = b.listing_id
  AND a.visitor_key = b.visitor_key
  AND a.created_at > b.created_at;

-- Handle ties on created_at by id
DELETE FROM public.listing_views a
USING public.listing_views b
WHERE a.listing_id = b.listing_id
  AND a.visitor_key = b.visitor_key
  AND a.created_at = b.created_at
  AND a.id > b.id;

DROP INDEX IF EXISTS public.listing_views_listing_visitor_idx;

ALTER TABLE public.listing_views
  ADD CONSTRAINT listing_views_listing_visitor_unique
  UNIQUE (listing_id, visitor_key);