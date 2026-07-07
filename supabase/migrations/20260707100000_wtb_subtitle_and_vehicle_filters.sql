-- 1. Undertittel for WTB-annonser, speiler public.listings.subtitle.
ALTER TABLE public.wtb_listings
  ADD COLUMN subtitle text;

-- 1b. popular_listings_last_week (brukt av landingssiden) må også returnere
-- subtitle, slik at listing-card kan vise den der.
CREATE OR REPLACE FUNCTION public.popular_listings_last_week(_limit int DEFAULT 8)
RETURNS TABLE(
  listing_id uuid,
  kaupet_code char(8),
  title text,
  subtitle text,
  price_nok int,
  is_free boolean,
  city text,
  created_at timestamptz,
  cover_path text,
  total_views bigint,
  views_last_week bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id,
    l.kaupet_code,
    l.title,
    l.subtitle,
    l.price_nok,
    l.is_free,
    l.city,
    l.created_at,
    (
      SELECT i.storage_path
      FROM public.listing_images i
      WHERE i.listing_id = l.id
      ORDER BY i.sort_order ASC
      LIMIT 1
    ) AS cover_path,
    (SELECT count(*) FROM public.listing_view_events e WHERE e.listing_id = l.id) AS total_views,
    (SELECT count(*) FROM public.listing_view_events e
       WHERE e.listing_id = l.id
         AND e.created_at > now() - interval '7 days') AS views_last_week
  FROM public.listings l
  WHERE l.status = 'active'
  ORDER BY views_last_week DESC NULLS LAST, l.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 8), 50));
$$;

-- 2. Konsolider motorsykkel sin 'engine_cc' til felles nøkkel
--    'engine_displacement_cc' (samme nøkkel brukes nå på tvers av alle
--    kjøretøykategorier, hentet fra Vegvesenet-oppslaget sitt 'slagvolum').
UPDATE public.category_filters
SET key = 'engine_displacement_cc', label_nb = 'Slagvolum'
WHERE category_id IN (SELECT id FROM public.categories WHERE slug = 'motorsykkel')
  AND key = 'engine_cc';

UPDATE public.listings l
SET attributes = (attributes - 'engine_cc') || jsonb_build_object('engine_displacement_cc', attributes->'engine_cc')
WHERE attributes ? 'engine_cc';

-- 3. Nye category_filters-rader for felt hentet fra Vegvesenet-oppslaget,
--    for hver kjøretøy-leaf-kategori. Alle valgfrie (ikke required-gating) —
--    et mislykket/utelatt oppslag skal ikke blokkere publisering.
INSERT INTO public.category_filters (category_id, key, label_nb, type, unit, options, sort_order)
SELECT c.id, f.key, f.label_nb, f.type, f.unit, f.options::jsonb, f.sort_order
FROM (VALUES
  -- Personbil / varebil
  ('personbil', 'power_hk', 'Effekt', 'number', 'hk', NULL, 7),
  ('personbil', 'drive_type', 'Hjuldrift', 'select', NULL,
    '[{"value":"forhjul","label_nb":"Forhjulsdrift"},{"value":"bakhjul","label_nb":"Bakhjulsdrift"},{"value":"4x4","label_nb":"Firehjulsdrift"}]', 8),
  ('personbil', 'weight_kg', 'Vekt', 'number', 'kg', NULL, 9),
  ('personbil', 'tow_hitch', 'Hengerfeste', 'boolean', NULL, NULL, 10),
  ('personbil', 'max_tow_weight_kg', 'Tillatt hengervekt', 'number', 'kg', NULL, 11),
  ('personbil', 'seats', 'Antall seter', 'number', NULL, NULL, 12),
  ('personbil', 'imported_used', 'Bruktimportert', 'boolean', NULL, NULL, 13),
  ('personbil', 'first_registration_date', 'Førstegangsregistrering', 'text', NULL, NULL, 14),
  ('personbil', 'color', 'Farge', 'text', NULL, NULL, 15),
  ('personbil', 'cylinders', 'Antall sylindre', 'number', NULL, NULL, 16),
  ('personbil', 'engine_displacement_cc', 'Slagvolum', 'number', 'cc', NULL, 17),
  ('personbil', 'engine_code', 'Motorkode', 'text', NULL, NULL, 18),
  ('personbil', 'next_eu_control', 'Neste EU-kontroll', 'text', NULL, NULL, 19),

  ('varebil', 'power_hk', 'Effekt', 'number', 'hk', NULL, 7),
  ('varebil', 'drive_type', 'Hjuldrift', 'select', NULL,
    '[{"value":"forhjul","label_nb":"Forhjulsdrift"},{"value":"bakhjul","label_nb":"Bakhjulsdrift"},{"value":"4x4","label_nb":"Firehjulsdrift"}]', 8),
  ('varebil', 'weight_kg', 'Vekt', 'number', 'kg', NULL, 9),
  ('varebil', 'tow_hitch', 'Hengerfeste', 'boolean', NULL, NULL, 10),
  ('varebil', 'max_tow_weight_kg', 'Tillatt hengervekt', 'number', 'kg', NULL, 11),
  ('varebil', 'seats', 'Antall seter', 'number', NULL, NULL, 12),
  ('varebil', 'imported_used', 'Bruktimportert', 'boolean', NULL, NULL, 13),
  ('varebil', 'first_registration_date', 'Førstegangsregistrering', 'text', NULL, NULL, 14),
  ('varebil', 'color', 'Farge', 'text', NULL, NULL, 15),
  ('varebil', 'cylinders', 'Antall sylindre', 'number', NULL, NULL, 16),
  ('varebil', 'engine_displacement_cc', 'Slagvolum', 'number', 'cc', NULL, 17),
  ('varebil', 'engine_code', 'Motorkode', 'text', NULL, NULL, 18),
  ('varebil', 'next_eu_control', 'Neste EU-kontroll', 'text', NULL, NULL, 19),

  -- Bobil og campingvogn
  ('bobil-og-campingvogn', 'model', 'Modell', 'text', NULL, NULL, 4),
  ('bobil-og-campingvogn', 'fuel_type', 'Drivstoff', 'select', NULL,
    '[{"value":"bensin","label_nb":"Bensin"},{"value":"diesel","label_nb":"Diesel"},{"value":"el","label_nb":"El"},{"value":"hybrid","label_nb":"Hybrid"}]', 5),
  ('bobil-og-campingvogn', 'transmission', 'Girkasse', 'select', NULL,
    '[{"value":"manuell","label_nb":"Manuell"},{"value":"automat","label_nb":"Automat"}]', 6),
  ('bobil-og-campingvogn', 'power_hk', 'Effekt', 'number', 'hk', NULL, 7),
  ('bobil-og-campingvogn', 'weight_kg', 'Vekt', 'number', 'kg', NULL, 8),
  ('bobil-og-campingvogn', 'tow_hitch', 'Hengerfeste', 'boolean', NULL, NULL, 9),
  ('bobil-og-campingvogn', 'max_tow_weight_kg', 'Tillatt hengervekt', 'number', 'kg', NULL, 10),
  ('bobil-og-campingvogn', 'seats', 'Antall seter', 'number', NULL, NULL, 11),
  ('bobil-og-campingvogn', 'sleeping_places', 'Antall soveplasser', 'number', NULL, NULL, 12),
  ('bobil-og-campingvogn', 'imported_used', 'Bruktimportert', 'boolean', NULL, NULL, 13),
  ('bobil-og-campingvogn', 'first_registration_date', 'Førstegangsregistrering', 'text', NULL, NULL, 14),
  ('bobil-og-campingvogn', 'color', 'Farge', 'text', NULL, NULL, 15),
  ('bobil-og-campingvogn', 'cylinders', 'Antall sylindre', 'number', NULL, NULL, 16),
  ('bobil-og-campingvogn', 'engine_code', 'Motorkode', 'text', NULL, NULL, 17),
  ('bobil-og-campingvogn', 'next_eu_control', 'Neste EU-kontroll', 'text', NULL, NULL, 18),

  -- Motorsykkel
  ('motorsykkel', 'fuel_type', 'Drivstoff', 'select', NULL,
    '[{"value":"bensin","label_nb":"Bensin"},{"value":"diesel","label_nb":"Diesel"},{"value":"el","label_nb":"El"},{"value":"hybrid","label_nb":"Hybrid"}]', 5),
  ('motorsykkel', 'transmission', 'Girkasse', 'select', NULL,
    '[{"value":"manuell","label_nb":"Manuell"},{"value":"automat","label_nb":"Automat"}]', 6),
  ('motorsykkel', 'power_hk', 'Effekt', 'number', 'hk', NULL, 7),
  ('motorsykkel', 'weight_kg', 'Vekt', 'number', 'kg', NULL, 8),
  ('motorsykkel', 'imported_used', 'Bruktimportert', 'boolean', NULL, NULL, 9),
  ('motorsykkel', 'first_registration_date', 'Førstegangsregistrering', 'text', NULL, NULL, 10),
  ('motorsykkel', 'color', 'Farge', 'text', NULL, NULL, 11),
  ('motorsykkel', 'cylinders', 'Antall sylindre', 'number', NULL, NULL, 12),
  ('motorsykkel', 'engine_code', 'Motorkode', 'text', NULL, NULL, 13),
  ('motorsykkel', 'next_eu_control', 'Neste EU-kontroll', 'text', NULL, NULL, 14),

  -- Moped og scooter
  ('moped-og-scooter', 'model', 'Modell', 'text', NULL, NULL, 3),
  ('moped-og-scooter', 'fuel_type', 'Drivstoff', 'select', NULL,
    '[{"value":"bensin","label_nb":"Bensin"},{"value":"diesel","label_nb":"Diesel"},{"value":"el","label_nb":"El"},{"value":"hybrid","label_nb":"Hybrid"}]', 4),
  ('moped-og-scooter', 'power_hk', 'Effekt', 'number', 'hk', NULL, 5),
  ('moped-og-scooter', 'weight_kg', 'Vekt', 'number', 'kg', NULL, 6),
  ('moped-og-scooter', 'imported_used', 'Bruktimportert', 'boolean', NULL, NULL, 7),
  ('moped-og-scooter', 'first_registration_date', 'Førstegangsregistrering', 'text', NULL, NULL, 8),
  ('moped-og-scooter', 'color', 'Farge', 'text', NULL, NULL, 9),
  ('moped-og-scooter', 'engine_displacement_cc', 'Slagvolum', 'number', 'cc', NULL, 10),
  ('moped-og-scooter', 'next_eu_control', 'Neste EU-kontroll', 'text', NULL, NULL, 11),

  -- ATV og snøscooter
  ('atv-og-snoscooter', 'model', 'Modell', 'text', NULL, NULL, 3),
  ('atv-og-snoscooter', 'fuel_type', 'Drivstoff', 'select', NULL,
    '[{"value":"bensin","label_nb":"Bensin"},{"value":"diesel","label_nb":"Diesel"},{"value":"el","label_nb":"El"},{"value":"hybrid","label_nb":"Hybrid"}]', 4),
  ('atv-og-snoscooter', 'transmission', 'Girkasse', 'select', NULL,
    '[{"value":"manuell","label_nb":"Manuell"},{"value":"automat","label_nb":"Automat"}]', 5),
  ('atv-og-snoscooter', 'power_hk', 'Effekt', 'number', 'hk', NULL, 6),
  ('atv-og-snoscooter', 'weight_kg', 'Vekt', 'number', 'kg', NULL, 7),
  ('atv-og-snoscooter', 'imported_used', 'Bruktimportert', 'boolean', NULL, NULL, 8),
  ('atv-og-snoscooter', 'first_registration_date', 'Førstegangsregistrering', 'text', NULL, NULL, 9),
  ('atv-og-snoscooter', 'color', 'Farge', 'text', NULL, NULL, 10),
  ('atv-og-snoscooter', 'engine_displacement_cc', 'Slagvolum', 'number', 'cc', NULL, 11),
  ('atv-og-snoscooter', 'next_eu_control', 'Neste EU-kontroll', 'text', NULL, NULL, 12),

  -- Tilhenger
  ('tilhenger-leaf', 'weight_kg', 'Egenvekt', 'number', 'kg', NULL, 2),
  ('tilhenger-leaf', 'color', 'Farge', 'text', NULL, NULL, 3),
  ('tilhenger-leaf', 'first_registration_date', 'Førstegangsregistrering', 'text', NULL, NULL, 4),
  ('tilhenger-leaf', 'imported_used', 'Bruktimportert', 'boolean', NULL, NULL, 5),
  ('tilhenger-leaf', 'next_eu_control', 'Neste EU-kontroll', 'text', NULL, NULL, 6)
) AS f(slug, key, label_nb, type, unit, options, sort_order)
JOIN public.categories c ON c.slug = f.slug
WHERE NOT EXISTS (
  SELECT 1 FROM public.category_filters cf WHERE cf.category_id = c.id AND cf.key = f.key
);
