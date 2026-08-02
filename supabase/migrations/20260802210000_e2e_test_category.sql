-- Dedicated category for e2e tests (see e2e/publish-listing.spec.ts), so the
-- test doesn't depend on a real production category's name/attributes
-- staying stable. A root-level category with no children (so it's directly
-- selectable, no drill-down) and no category_filters rows (no attributes to
-- fill in) — the simplest possible leaf for a test that just needs to reach
-- past the category-select step.
--
-- sort_order is intentionally far above every real category (999 is the
-- highest in use, for "Annet") so this always sorts last in the picker
-- grid. There is no "hidden from real users" flag on categories today — see
-- the E2E robustness plan for why that was judged too invasive to add just
-- for this. Never rename or delete this category's slug
-- ('e2e-test-listing') without updating e2e/publish-listing.spec.ts.
INSERT INTO public.categories (slug, name_nb, sort_order, parent_id, icon)
VALUES ('e2e-test-listing', 'E2E-test (ikke bruk)', 9999, NULL, 'FlaskConical');
