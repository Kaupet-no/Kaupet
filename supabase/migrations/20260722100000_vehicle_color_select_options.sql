-- "Farge" on vehicle leaves was seeded as free-text (20260707100000 and the
-- bobil/campingvogn split in 20260721120000), so the manual/AttributeFields
-- entry form rendered it as a plain text input with no choices — confusing
-- next to the neighboring select fields (Drivstoff/Girkasse/Hjuldrift).
-- Converts it to a fixed-choice select across every vehicle leaf, matching
-- how SVV/manual entry actually describes a vehicle's color in practice.
-- Existing free-text `attributes.color` values on old listings won't match
-- any option value and will just show as unset until re-edited — acceptable,
-- there's no reliable way to auto-map arbitrary past free text onto this list.
UPDATE public.category_filters cf
SET type = 'select',
    options = '[
      {"value": "black", "label_nb": "Svart"},
      {"value": "white", "label_nb": "Hvit"},
      {"value": "silver", "label_nb": "Sølv"},
      {"value": "gray", "label_nb": "Grå"},
      {"value": "red", "label_nb": "Rød"},
      {"value": "blue", "label_nb": "Blå"},
      {"value": "green", "label_nb": "Grønn"},
      {"value": "yellow", "label_nb": "Gul"},
      {"value": "orange", "label_nb": "Oransje"},
      {"value": "brown", "label_nb": "Brun"},
      {"value": "beige", "label_nb": "Beige"},
      {"value": "purple", "label_nb": "Lilla"},
      {"value": "other", "label_nb": "Annen farge"}
    ]'::jsonb
FROM public.categories c
WHERE cf.category_id = c.id
  AND cf.key = 'color'
  AND c.slug IN (
    'personbil', 'varebil', 'motorsykkel', 'moped-og-scooter',
    'atv-og-snoscooter', 'tilhenger-leaf', 'bobil', 'campingvogn'
  );
