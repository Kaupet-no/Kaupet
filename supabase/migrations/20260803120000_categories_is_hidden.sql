-- Real "hidden from end users" mechanism for categories, replacing the
-- sort_order-9999-plus-clear-naming workaround used for the e2e test
-- categories (see 20260802210000_e2e_test_category.sql and
-- 20260803090000_e2e_test_vehicle_category.sql). Scoped narrowly: hidden
-- categories are filtered out of *discovery* surfaces (landing pages,
-- browse/search, public category pages, sitemap) but intentionally still
-- appear in the listing-creation category picker (ny-annonse.tsx) — the e2e
-- tests select these categories through that exact picker as part of
-- testing the real user flow, so filtering it there too would require a
-- test-only bypass that weakens the point of an end-to-end test. The
-- existing sort_order/naming mitigation already keeps the risk low there.
--
-- No RLS policy changes needed: SELECT is already open to everyone
-- ("Categories are viewable by everyone"), and UPDATE is already
-- admin-only ("Admins can update categories") — is_hidden is just another
-- column that policy covers.
ALTER TABLE public.categories
  ADD COLUMN is_hidden boolean NOT NULL DEFAULT false;

UPDATE public.categories
SET is_hidden = true
WHERE slug IN ('e2e-test-listing', 'e2e-test-vehicle');
