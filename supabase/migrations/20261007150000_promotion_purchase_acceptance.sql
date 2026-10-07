-- Historical purchases and administrative gifts have no recorded checkout
-- acceptance. Do not invent consent for them. New checkouts record all three
-- values on the pending row, before contacting the payment provider.
ALTER TABLE public.listing_promotions
  ADD COLUMN purchase_terms_version text,
  ADD COLUMN purchase_terms_accepted_at timestamptz,
  ADD COLUMN purchase_acceptance_text text,
  ADD CONSTRAINT listing_promotions_purchase_acceptance_complete CHECK (
    (purchase_terms_version IS NULL AND purchase_terms_accepted_at IS NULL AND purchase_acceptance_text IS NULL)
    OR
    (purchase_terms_version IS NOT NULL AND length(btrim(purchase_terms_version)) > 0
      AND purchase_terms_accepted_at IS NOT NULL
      AND purchase_acceptance_text IS NOT NULL AND length(btrim(purchase_acceptance_text)) > 0)
  );

COMMENT ON COLUMN public.listing_promotions.purchase_terms_accepted_at IS
  'Server timestamp of explicit checkout acceptance; NULL means no historical evidence, not consent.';
