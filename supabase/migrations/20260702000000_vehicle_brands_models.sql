-- Merke/modell for kjøretøykategorier som koblede, predefinerte datasett i
-- stedet for fritekst (et merke har mange modeller, en modell har ett merke).
-- Brukes sammen med Statens vegvesen-kjøretøyoppslag: importerte merker/
-- modeller som ikke finnes fra før kan legges til av bruker etter bekreftelse.

CREATE TABLE public.vehicle_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  -- Skiller merkelister per kjøretøytype, siden de ikke overlapper meningsfullt.
  category_group TEXT NOT NULL CHECK (
    category_group IN ('bil', 'motorsykkel', 'moped_atv', 'bobil_campingvogn', 'henger')
  ),
  -- Brukerforeslåtte merker (fra Statens vegvesen-import) starter som 'pending'
  -- og må godkjennes av admin/moderator i administrasjonspanelet før de dukker
  -- opp som valg for andre brukere. Seed-data settes eksplisitt til 'approved'.
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, category_group)
);
CREATE INDEX vehicle_brands_group_idx ON public.vehicle_brands(category_group, name);
CREATE INDEX vehicle_brands_pending_idx ON public.vehicle_brands(status) WHERE status = 'pending';

CREATE TABLE public.vehicle_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.vehicle_brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brand_id, name)
);
CREATE INDEX vehicle_models_brand_idx ON public.vehicle_models(brand_id, name);
CREATE INDEX vehicle_models_pending_idx ON public.vehicle_models(status) WHERE status = 'pending';

-- Rate-limits Statens vegvesen-oppslag per bruker (server-only bruk, se
-- vehicle-lookup.functions.ts). Ingen klienttilgang.
CREATE TABLE public.vehicle_lookup_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  registration_number TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX vehicle_lookup_log_user_time_idx ON public.vehicle_lookup_log(user_id, created_at);
ALTER TABLE public.vehicle_lookup_log ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.vehicle_lookup_log TO service_role;

GRANT SELECT ON public.vehicle_brands, public.vehicle_models TO anon, authenticated;
GRANT ALL ON public.vehicle_brands, public.vehicle_models TO service_role;
ALTER TABLE public.vehicle_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vehicle brands are viewable by everyone"
  ON public.vehicle_brands FOR SELECT USING (true);
CREATE POLICY "Vehicle models are viewable by everyone"
  ON public.vehicle_models FOR SELECT USING (true);

-- Innloggede brukere kan legge til nye merker/modeller (foreslått av
-- Statens vegvesen-oppslag ved import av et registrert kjøretøy vi ikke
-- kjenner fra før), men kun som 'pending' — kan ikke sette seg selv til
-- godkjent. Ingen update/delete fra klienten (kun via admin-RPC-ene under).
CREATE POLICY "Authenticated users can propose vehicle brands"
  ON public.vehicle_brands FOR INSERT
  TO authenticated
  WITH CHECK (status = 'pending' AND submitted_by = auth.uid());
CREATE POLICY "Authenticated users can propose vehicle models"
  ON public.vehicle_models FOR INSERT
  TO authenticated
  WITH CHECK (status = 'pending' AND submitted_by = auth.uid());

-- RPC: hent alle ventende merke-/modellforslag til administrasjonspanelet.
CREATE OR REPLACE FUNCTION public.admin_list_pending_vehicle_entries()
RETURNS TABLE(
  kind text,
  id uuid,
  name text,
  category_group text,
  brand_name text,
  submitted_by uuid,
  submitted_by_name text,
  created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
    SELECT 'brand'::text, b.id, b.name, b.category_group, NULL::text,
      b.submitted_by, p.display_name, b.created_at
    FROM public.vehicle_brands b
    LEFT JOIN public.profiles p ON p.id = b.submitted_by
    WHERE b.status = 'pending'
    UNION ALL
    SELECT 'model'::text, m.id, m.name, br.category_group, br.name,
      m.submitted_by, p.display_name, m.created_at
    FROM public.vehicle_models m
    JOIN public.vehicle_brands br ON br.id = m.brand_id
    LEFT JOIN public.profiles p ON p.id = m.submitted_by
    WHERE m.status = 'pending'
    ORDER BY created_at DESC;
END $$;
REVOKE ALL ON FUNCTION public.admin_list_pending_vehicle_entries FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_pending_vehicle_entries TO authenticated;

-- RPC: godkjenn/avslå et foreslått merke.
CREATE OR REPLACE FUNCTION public.admin_approve_vehicle_brand(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.vehicle_brands SET status = 'approved' WHERE id = _id;
END $$;
REVOKE ALL ON FUNCTION public.admin_approve_vehicle_brand FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_vehicle_brand TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_reject_vehicle_brand(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM public.vehicle_brands WHERE id = _id AND status = 'pending';
END $$;
REVOKE ALL ON FUNCTION public.admin_reject_vehicle_brand FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_vehicle_brand TO authenticated;

-- RPC: godkjenn/avslå en foreslått modell.
CREATE OR REPLACE FUNCTION public.admin_approve_vehicle_model(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.vehicle_models SET status = 'approved' WHERE id = _id;
END $$;
REVOKE ALL ON FUNCTION public.admin_approve_vehicle_model FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_vehicle_model TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_reject_vehicle_model(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM public.vehicle_models WHERE id = _id AND status = 'pending';
END $$;
REVOKE ALL ON FUNCTION public.admin_reject_vehicle_model FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_vehicle_model TO authenticated;

-- Utvid category_filters.type til å støtte koblede merke/modell-nedtrekksmenyer.
ALTER TABLE public.category_filters DROP CONSTRAINT category_filters_type_check;
ALTER TABLE public.category_filters ADD CONSTRAINT category_filters_type_check
  CHECK (type IN ('select', 'multiselect', 'number', 'range', 'boolean', 'text', 'brand_select', 'model_select'));

-- Bytt brand/model-filtre for kjøretøykategoriene til de koblede typene.
-- `unit` (ubrukt for brand_select) lagrer hvilken vehicle_brands.category_group
-- feltet skal hente fra, siden filteret ikke selv vet hvilken gruppe det
-- tilhører uten en ekstra kolonne.
UPDATE public.category_filters cf
SET type = 'brand_select', unit = v.group_name
FROM (VALUES
  ('personbil', 'bil'),
  ('varebil', 'bil'),
  ('bobil-og-campingvogn', 'bobil_campingvogn'),
  ('motorsykkel', 'motorsykkel'),
  ('moped-og-scooter', 'moped_atv'),
  ('atv-og-snoscooter', 'moped_atv'),
  ('tilhenger-leaf', 'henger')
) AS v(slug, group_name)
JOIN public.categories c ON c.slug = v.slug
WHERE cf.category_id = c.id AND cf.key = 'brand';

UPDATE public.category_filters cf
SET type = 'model_select'
FROM public.categories c
WHERE cf.category_id = c.id AND cf.key = 'model'
  AND c.slug IN ('personbil', 'varebil', 'motorsykkel');

-- Legg til model-filter (koblet til brand for bil/mc, fritekst for bobil/
-- moped/atv/henger jf. plan: kun bil/mc har modell som eget felt fra før;
-- bobil/campingvogn, moped/atv får nå koblet modell, henger får fritekst
-- siden Vegvesenet stort sett bare oppgir produsent for hengere).
INSERT INTO public.category_filters (category_id, key, label_nb, type, unit, options, sort_order)
SELECT c.id, 'model', 'Modell', 'model_select', NULL, NULL, 2
FROM public.categories c
WHERE c.slug IN ('bobil-og-campingvogn', 'moped-og-scooter', 'atv-og-snoscooter')
  AND NOT EXISTS (SELECT 1 FROM public.category_filters cf WHERE cf.category_id = c.id AND cf.key = 'model');

INSERT INTO public.category_filters (category_id, key, label_nb, type, unit, options, sort_order)
SELECT c.id, 'model', 'Modell', 'text', NULL, NULL, 2
FROM public.categories c
WHERE c.slug = 'tilhenger-leaf'
  AND NOT EXISTS (SELECT 1 FROM public.category_filters cf WHERE cf.category_id = c.id AND cf.key = 'model');

-- Registreringsstatus + registreringsnummer, arves av hele "Bil og MC"- og
-- "Tilhenger"-treet siden filtre arves fra forelder til barn.
INSERT INTO public.category_filters (category_id, key, label_nb, type, unit, options, sort_order)
SELECT c.id, v.key, v.label_nb, v.type, NULL, NULL, v.sort_order
FROM (VALUES
  ('bil-og-mc', 'is_registered', 'Kjøretøyet er registrert', 'boolean', 90),
  ('bil-og-mc', 'registration_number', 'Registreringsnummer', 'text', 91),
  ('tilhenger', 'is_registered', 'Kjøretøyet er registrert', 'boolean', 90),
  ('tilhenger', 'registration_number', 'Registreringsnummer', 'text', 91)
) AS v(slug, key, label_nb, type, sort_order)
JOIN public.categories c ON c.slug = v.slug
WHERE NOT EXISTS (SELECT 1 FROM public.category_filters cf WHERE cf.category_id = c.id AND cf.key = v.key);

-- Startsett med vanlige merker/modeller, godkjent fra dag én (kuratert av
-- oss, ikke brukerforeslått). Ikke uttømmende — datasettet vokser organisk
-- via godkjente forslag fra Statens vegvesen-oppslag.
INSERT INTO public.vehicle_brands (name, category_group, status)
SELECT v.name, v.group_name, 'approved' FROM (VALUES
  ('Volkswagen', 'bil'), ('Toyota', 'bil'), ('Volvo', 'bil'), ('BMW', 'bil'),
  ('Mercedes-Benz', 'bil'), ('Audi', 'bil'), ('Ford', 'bil'), ('Skoda', 'bil'),
  ('Tesla', 'bil'), ('Nissan', 'bil'), ('Hyundai', 'bil'), ('Kia', 'bil'),
  ('Peugeot', 'bil'), ('Renault', 'bil'), ('Opel', 'bil'), ('Mazda', 'bil'),
  ('Honda', 'bil'), ('Mitsubishi', 'bil'), ('Suzuki', 'bil'), ('Subaru', 'bil'),
  ('Honda', 'motorsykkel'), ('Yamaha', 'motorsykkel'), ('Kawasaki', 'motorsykkel'),
  ('Suzuki', 'motorsykkel'), ('BMW', 'motorsykkel'), ('Ducati', 'motorsykkel'),
  ('KTM', 'motorsykkel'), ('Harley-Davidson', 'motorsykkel'), ('Triumph', 'motorsykkel'),
  ('Piaggio', 'moped_atv'), ('Vespa', 'moped_atv'), ('Yamaha', 'moped_atv'),
  ('Polaris', 'moped_atv'), ('Can-Am', 'moped_atv'), ('CFMoto', 'moped_atv'),
  ('Hobby', 'bobil_campingvogn'), ('Adria', 'bobil_campingvogn'), ('Knaus', 'bobil_campingvogn'),
  ('Dethleffs', 'bobil_campingvogn'), ('Bürstner', 'bobil_campingvogn'), ('Kabe', 'bobil_campingvogn'),
  ('Polar', 'bobil_campingvogn'),
  ('Variant', 'henger'), ('Brenderup', 'henger'), ('Böckmann', 'henger'), ('Ifor Williams', 'henger')
) AS v(name, group_name)
ON CONFLICT (name, category_group) DO NOTHING;

INSERT INTO public.vehicle_models (brand_id, name, status)
SELECT b.id, v.model, 'approved'
FROM (VALUES
  ('Volkswagen', 'bil', 'Golf'), ('Volkswagen', 'bil', 'Passat'), ('Volkswagen', 'bil', 'Polo'),
  ('Volkswagen', 'bil', 'Tiguan'), ('Volkswagen', 'bil', 'ID.4'),
  ('Toyota', 'bil', 'Corolla'), ('Toyota', 'bil', 'RAV4'), ('Toyota', 'bil', 'Yaris'), ('Toyota', 'bil', 'Aygo'),
  ('Volvo', 'bil', 'V70'), ('Volvo', 'bil', 'XC60'), ('Volvo', 'bil', 'XC90'), ('Volvo', 'bil', 'V60'),
  ('BMW', 'bil', '3-serie'), ('BMW', 'bil', '5-serie'), ('BMW', 'bil', 'X3'), ('BMW', 'bil', 'X5'),
  ('Mercedes-Benz', 'bil', 'C-klasse'), ('Mercedes-Benz', 'bil', 'E-klasse'), ('Mercedes-Benz', 'bil', 'GLC'),
  ('Audi', 'bil', 'A3'), ('Audi', 'bil', 'A4'), ('Audi', 'bil', 'Q5'), ('Audi', 'bil', 'e-tron'),
  ('Ford', 'bil', 'Focus'), ('Ford', 'bil', 'Fiesta'), ('Ford', 'bil', 'Kuga'), ('Ford', 'bil', 'Mondeo'),
  ('Skoda', 'bil', 'Octavia'), ('Skoda', 'bil', 'Fabia'), ('Skoda', 'bil', 'Kodiaq'),
  ('Tesla', 'bil', 'Model 3'), ('Tesla', 'bil', 'Model Y'), ('Tesla', 'bil', 'Model S'), ('Tesla', 'bil', 'Model X'),
  ('Nissan', 'bil', 'Leaf'), ('Nissan', 'bil', 'Qashqai'), ('Nissan', 'bil', 'Juke'),
  ('Hyundai', 'bil', 'i30'), ('Hyundai', 'bil', 'Tucson'), ('Hyundai', 'bil', 'Kona'),
  ('Kia', 'bil', 'Sportage'), ('Kia', 'bil', 'Niro'), ('Kia', 'bil', 'EV6'),
  ('Honda', 'motorsykkel', 'CB500'), ('Honda', 'motorsykkel', 'CBR600RR'), ('Honda', 'motorsykkel', 'Africa Twin'),
  ('Yamaha', 'motorsykkel', 'MT-07'), ('Yamaha', 'motorsykkel', 'MT-09'), ('Yamaha', 'motorsykkel', 'R1'),
  ('Kawasaki', 'motorsykkel', 'Ninja 650'), ('Kawasaki', 'motorsykkel', 'Z900'),
  ('KTM', 'motorsykkel', 'Duke 390'), ('KTM', 'motorsykkel', 'Adventure 890'),
  ('Harley-Davidson', 'motorsykkel', 'Sportster'), ('Harley-Davidson', 'motorsykkel', 'Street Glide')
) AS v(brand_name, group_name, model)
JOIN public.vehicle_brands b ON b.name = v.brand_name AND b.category_group = v.group_name
ON CONFLICT (brand_id, name) DO NOTHING;
