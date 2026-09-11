-- Expand the curated font choices available to Proff organization profiles.
ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_listing_font_check;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_listing_font_check
    CHECK (listing_font IN ('newsreader', 'inter', 'dm_sans', 'source_serif_4'));
