-- JPEG XL is accepted by the client image validation and file pickers.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/jxl'
]::text[]
WHERE id IN (
  'listing-images',
  'avatars',
  'message-attachments',
  'organization-logos'
);
