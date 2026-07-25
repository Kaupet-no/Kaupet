-- 360-graders spin-visning for Bil/MC-annonser: en sekvens av bilder tatt
-- rundt objektet via mobilappen, koblet til annonseutkastet via en
-- tidsbegrenset QR-sesjon (se listing_360_capture_sessions).

CREATE TABLE public.listing_360_frames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  frame_order INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX listing_360_frames_listing_order_idx ON public.listing_360_frames(listing_id, frame_order);
GRANT SELECT ON public.listing_360_frames TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listing_360_frames TO authenticated;
GRANT ALL ON public.listing_360_frames TO service_role;
ALTER TABLE public.listing_360_frames ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Listing 360 frames viewable by everyone" ON public.listing_360_frames FOR SELECT USING (true);
CREATE POLICY "Owners can manage listing 360 frames" ON public.listing_360_frames FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_id AND l.seller_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_id AND l.seller_id = auth.uid()));

-- Kortlevd token-sesjon opprettet fra desktop (innlogget selger) og løst inn
-- fra mobilen (uinnlogget). Tokenet er den eneste autorisasjonen for
-- bildeopplasting fra mobil, så tabellen eksponeres ikke direkte til
-- anon/authenticated — kun service_role (server-funksjonene bruker
-- supabaseAdmin og validerer token + expires_at/used_at manuelt).
CREATE TABLE public.listing_360_capture_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX listing_360_capture_sessions_listing_idx ON public.listing_360_capture_sessions(listing_id);
GRANT ALL ON public.listing_360_capture_sessions TO service_role;
ALTER TABLE public.listing_360_capture_sessions ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'listing-360-frames',
  'listing-360-frames',
  false,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Listing 360 frames readable for active or owned listings"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'listing-360-frames'
    AND EXISTS (
      SELECT 1 FROM public.listing_360_frames f
      JOIN public.listings l ON l.id = f.listing_id
      WHERE f.storage_path = storage.objects.name
        AND (l.status = 'active' OR l.seller_id = auth.uid())
    )
  );
