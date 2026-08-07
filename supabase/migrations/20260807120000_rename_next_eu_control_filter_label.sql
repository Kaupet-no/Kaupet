-- The search-side "Neste EU-kontroll" attribute filter now matches listings
-- whose EU-control date is on or after the chosen date (an earliest-date
-- filter, not an exact-date one) — see category-filter-fields.tsx and the
-- "date_min" AttributeFilterValue kind. Rename the label so the UI reflects
-- that without any per-page string override.
update public.category_filters
set label_nb = 'Tidligst neste EU-kontroll'
where key = 'next_eu_control';
