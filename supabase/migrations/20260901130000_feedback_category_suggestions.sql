-- Kategoriforslag bruker den eksisterende, serverstyrte feedback-flyten.
-- RLS forblir uten direkte policies; innsending og admin-tilgang går gjennom
-- de eksisterende serverfunksjonene med henholdsvis rate-limit og admin-guard.
ALTER TABLE public.feedback
  DROP CONSTRAINT feedback_type_check,
  ADD CONSTRAINT feedback_type_check CHECK (type IN ('ris', 'ros', 'kategori'));

ALTER TABLE public.feedback
  ADD COLUMN category_name text,
  ADD COLUMN category_description text;

ALTER TABLE public.feedback
  ADD CONSTRAINT feedback_category_name_check
    CHECK (category_name IS NULL OR char_length(category_name) BETWEEN 1 AND 200),
  ADD CONSTRAINT feedback_category_description_check
    CHECK (category_description IS NULL OR char_length(category_description) BETWEEN 1 AND 2000),
  ADD CONSTRAINT feedback_category_fields_check
    CHECK ((type = 'kategori' AND category_name IS NOT NULL) OR type <> 'kategori');

CREATE INDEX feedback_category_name_idx ON public.feedback (category_name)
  WHERE type = 'kategori';
