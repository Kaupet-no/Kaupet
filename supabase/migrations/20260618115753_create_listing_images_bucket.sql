-- Bucketen "listing-images" ble opprinnelig opprettet manuelt via dashbordet
-- (ikke sporet i migrasjonshistorikken), så den mangler i en frisk replay av
-- skjemaet. RLS-policiene på storage.objects forutsetter at den finnes.
-- Privat bucket: appen bruker createSignedUrls(), ikke getPublicUrl().
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'listing-images',
  'listing-images',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
