-- Persist Proff presentation choices on the organization so every listing uses
-- the same profile. Redaksjonell is the product default.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS listing_concept text NOT NULL DEFAULT 'redaksjonell',
  ADD COLUMN IF NOT EXISTS listing_font text NOT NULL DEFAULT 'newsreader',
  ADD COLUMN IF NOT EXISTS listing_overtitle text NOT NULL DEFAULT 'presentert_av';

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_listing_concept_check,
  DROP CONSTRAINT IF EXISTS organizations_listing_font_check,
  DROP CONSTRAINT IF EXISTS organizations_listing_overtitle_check;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_listing_concept_check
    CHECK (listing_concept IN ('signatur', 'redaksjonell', 'butikk')),
  ADD CONSTRAINT organizations_listing_font_check
    CHECK (listing_font IN ('newsreader', 'inter')),
  ADD CONSTRAINT organizations_listing_overtitle_check
    CHECK (listing_overtitle IN ('annonse_fra', 'presentert_av', 'bedriftsannonse'));

-- Existing rows are covered by the column defaults; make the intended values
-- explicit for installations where a previous partial migration added columns.
UPDATE public.organizations
SET listing_concept = COALESCE(listing_concept, 'redaksjonell'),
    listing_font = COALESCE(listing_font, 'newsreader'),
    listing_overtitle = COALESCE(listing_overtitle, 'presentert_av');

DROP VIEW IF EXISTS public.organizations_public;

CREATE VIEW public.organizations_public AS
  SELECT
    id,
    display_name,
    legal_name,
    organization_number,
    website_url,
    logo_path,
    brand_palette,
    listing_concept,
    listing_font,
    listing_overtitle,
    created_at,
    (selected_plan = 'proff' AND proff_access_until IS NOT NULL AND proff_access_until > now())
      AS has_active_proff
  FROM public.organizations;

GRANT SELECT ON public.organizations_public TO anon, authenticated;
