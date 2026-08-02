-- Hand-picked colloquial synonyms for the vehicle select-filters (Drivstoff,
-- Girkasse, Hjuldrift) beyond their own option label — e.g. "automatgir"
-- doesn't literally equal the option label "Automat", so the generic
-- label-based seed in 20260731140000_filter_synonyms.sql wouldn't catch it.
-- Applies across every category that has these keys (Bil, Bobil,
-- Motorsykkel, Moped og scooter — drive_type is Bil-only already).
INSERT INTO public.filter_synonyms (category_filter_id, option_value, phrase, is_generated)
SELECT cf.id, v.option_value, v.phrase, false
FROM public.category_filters cf
JOIN (VALUES
  ('fuel_type', 'el', 'elbil'),
  ('fuel_type', 'el', 'elektrisk'),
  ('fuel_type', 'diesel', 'dieselbil'),
  ('fuel_type', 'bensin', 'bensinbil'),
  ('fuel_type', 'hybrid', 'hybridbil'),
  ('transmission', 'automat', 'automatgir'),
  ('transmission', 'automat', 'automatgirkasse'),
  ('transmission', 'manuell', 'manuellgir'),
  ('drive_type', '4x4', 'firehjulstrekk'),
  ('drive_type', '4x4', '4wd'),
  ('drive_type', 'forhjul', 'forhjulstrekk'),
  ('drive_type', 'bakhjul', 'bakhjulstrekk')
) AS v(key, option_value, phrase) ON cf.key = v.key
ON CONFLICT (category_filter_id, option_value, phrase) DO NOTHING;
