-- Fase 7 (UX-audit): bildevedlegg i meldinger. Egen, privat bucket (samme
-- mønster som listing-images/listing-360-frames — ingen storage.objects-policy
-- i dette repoet, tilgang styres av signerte URL-er utstedt via egen kode).
ALTER TABLE public.messages
  ADD COLUMN attachment_path text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('message-attachments', 'message-attachments', false)
ON CONFLICT (id) DO NOTHING;
