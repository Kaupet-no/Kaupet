-- Modellklasser (f.eks. Mercedes-Benz "C-klasse", "E-klasse") som et valgfritt
-- mellomnivå mellom merke og modell. De fleste merker har ingen klasser —
-- vehicle_models.class_id er nullable og påvirker ikke eksisterende data for
-- andre merker enn Mercedes-Benz (proof-of-concept-seed nederst i filen).

CREATE TABLE public.vehicle_model_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.vehicle_brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brand_id, name)
);
CREATE INDEX vehicle_model_classes_brand_idx ON public.vehicle_model_classes(brand_id, name);
CREATE INDEX vehicle_model_classes_pending_idx ON public.vehicle_model_classes(status) WHERE status = 'pending';

-- ON DELETE SET NULL (ikke CASCADE): sletting av en klasse skal ikke slette
-- de faktiske modellene under den, bare gjøre dem klasseløse igjen.
ALTER TABLE public.vehicle_models ADD COLUMN class_id UUID REFERENCES public.vehicle_model_classes(id) ON DELETE SET NULL;
CREATE INDEX vehicle_models_class_idx ON public.vehicle_models(class_id) WHERE class_id IS NOT NULL;

GRANT SELECT ON public.vehicle_model_classes TO anon, authenticated;
GRANT ALL ON public.vehicle_model_classes TO service_role;
ALTER TABLE public.vehicle_model_classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vehicle model classes are viewable by everyone"
  ON public.vehicle_model_classes FOR SELECT USING (true);

CREATE POLICY "Authenticated users can propose vehicle model classes"
  ON public.vehicle_model_classes FOR INSERT
  TO authenticated
  WITH CHECK (status = 'pending' AND submitted_by = auth.uid());

-- RPC: opprett en ny, ferdig godkjent klasse under et merke.
CREATE OR REPLACE FUNCTION public.admin_create_vehicle_model_class(_brand_id uuid, _name text)
RETURNS public.vehicle_model_classes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _row public.vehicle_model_classes;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  INSERT INTO public.vehicle_model_classes (brand_id, name, status, submitted_by)
  VALUES (_brand_id, trim(_name), 'approved', auth.uid())
  RETURNING * INTO _row;
  RETURN _row;
END $$;
REVOKE ALL ON FUNCTION public.admin_create_vehicle_model_class FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_vehicle_model_class TO authenticated;

-- RPC: omdøp en eksisterende klasse.
CREATE OR REPLACE FUNCTION public.admin_update_vehicle_model_class(_id uuid, _name text)
RETURNS public.vehicle_model_classes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _row public.vehicle_model_classes;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.vehicle_model_classes SET name = trim(_name) WHERE id = _id
  RETURNING * INTO _row;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Fant ikke klassen';
  END IF;
  RETURN _row;
END $$;
REVOKE ALL ON FUNCTION public.admin_update_vehicle_model_class FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_vehicle_model_class TO authenticated;

-- RPC: slett en klasse. Modeller under den settes automatisk class_id = NULL
-- via FK-en (ON DELETE SET NULL), ingen eksplisitt opprydding nødvendig.
CREATE OR REPLACE FUNCTION public.admin_delete_vehicle_model_class(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM public.vehicle_model_classes WHERE id = _id;
END $$;
REVOKE ALL ON FUNCTION public.admin_delete_vehicle_model_class FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_vehicle_model_class TO authenticated;

-- RPC: godkjenn/avslå en foreslått klasse.
CREATE OR REPLACE FUNCTION public.admin_approve_vehicle_model_class(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.vehicle_model_classes SET status = 'approved' WHERE id = _id;
END $$;
REVOKE ALL ON FUNCTION public.admin_approve_vehicle_model_class FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_vehicle_model_class TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_reject_vehicle_model_class(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM public.vehicle_model_classes WHERE id = _id AND status = 'pending';
END $$;
REVOKE ALL ON FUNCTION public.admin_reject_vehicle_model_class FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_vehicle_model_class TO authenticated;

-- Utvid admin_create/update_vehicle_model med valgfri _class_id (bakoverkompatibel
-- default NULL, så eksisterende kall uten parameteren fortsetter å virke).
CREATE OR REPLACE FUNCTION public.admin_create_vehicle_model(_brand_id uuid, _name text, _class_id uuid DEFAULT NULL)
RETURNS public.vehicle_models
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _row public.vehicle_models;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  INSERT INTO public.vehicle_models (brand_id, class_id, name, status, submitted_by)
  VALUES (_brand_id, _class_id, trim(_name), 'approved', auth.uid())
  RETURNING * INTO _row;
  RETURN _row;
END $$;

CREATE OR REPLACE FUNCTION public.admin_update_vehicle_model(_id uuid, _name text, _class_id uuid DEFAULT NULL)
RETURNS public.vehicle_models
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _row public.vehicle_models;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.vehicle_models SET name = trim(_name), class_id = _class_id WHERE id = _id
  RETURNING * INTO _row;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Fant ikke modellen';
  END IF;
  RETURN _row;
END $$;

-- Utvid pending-listen med klasseforslag som en tredje "kind".
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
    UNION ALL
    SELECT 'class'::text, mc.id, mc.name, br.category_group, br.name,
      mc.submitted_by, p.display_name, mc.created_at
    FROM public.vehicle_model_classes mc
    JOIN public.vehicle_brands br ON br.id = mc.brand_id
    LEFT JOIN public.profiles p ON p.id = mc.submitted_by
    WHERE mc.status = 'pending'
    ORDER BY created_at DESC;
END $$;

-- Utvid admin-CRUD-listen med klasse-kolonner slik at siden kan gruppere
-- modeller per klasse i ett kall, uten N+1. CREATE OR REPLACE kan ikke endre
-- RETURNS TABLE-formen på en eksisterende funksjon (SQLSTATE 42P13), så den
-- må droppes eksplisitt først.
DROP FUNCTION IF EXISTS public.admin_list_vehicle_brands_with_models();
CREATE OR REPLACE FUNCTION public.admin_list_vehicle_brands_with_models()
RETURNS TABLE(
  brand_id uuid,
  brand_name text,
  category_group text,
  model_id uuid,
  model_name text,
  class_id uuid,
  class_name text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
    SELECT b.id, b.name, b.category_group, m.id, m.name, mc.id, mc.name
    FROM public.vehicle_brands b
    LEFT JOIN public.vehicle_models m ON m.brand_id = b.id AND m.status = 'approved'
    LEFT JOIN public.vehicle_model_classes mc ON mc.id = m.class_id AND mc.status = 'approved'
    WHERE b.status = 'approved'
    ORDER BY b.category_group, b.name, mc.name NULLS FIRST, m.name;
END $$;
REVOKE ALL ON FUNCTION public.admin_list_vehicle_brands_with_models FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_vehicle_brands_with_models TO authenticated;

-- Proof-of-concept-data: Mercedes-Benz sine flate "C-klasse"/"E-klasse"-rader
-- var egentlig klassenavn, ikke modeller — konverter dem til klasser og legg
-- til ekte modeller (fullt SVV-modellnavn, f.eks. "C 200") under hver klasse.
-- "GLC" er en ekte modell (ikke en klasse) og røres ikke.
INSERT INTO public.vehicle_model_classes (brand_id, name, status)
SELECT b.id, v.class_name, 'approved'
FROM (VALUES ('C-klasse'), ('E-klasse'), ('A-klasse'), ('B-klasse')) AS v(class_name)
CROSS JOIN (SELECT id FROM public.vehicle_brands WHERE name = 'Mercedes-Benz' AND category_group = 'bil') b
ON CONFLICT (brand_id, name) DO NOTHING;

DELETE FROM public.vehicle_models
WHERE brand_id = (SELECT id FROM public.vehicle_brands WHERE name = 'Mercedes-Benz' AND category_group = 'bil')
  AND name IN ('C-klasse', 'E-klasse');

INSERT INTO public.vehicle_models (brand_id, class_id, name, status)
SELECT b.id, c.id, v.model, 'approved'
FROM (VALUES
  ('C-klasse', 'C 180'), ('C-klasse', 'C 200'), ('C-klasse', 'C 220d'),
  ('E-klasse', 'E 200'), ('E-klasse', 'E 220d'), ('E-klasse', 'E 300'),
  ('A-klasse', 'A 140'), ('A-klasse', 'A 180'),
  ('B-klasse', 'B 180')
) AS v(class_name, model)
JOIN public.vehicle_model_classes c
  ON c.name = v.class_name
  AND c.brand_id = (SELECT id FROM public.vehicle_brands WHERE name = 'Mercedes-Benz' AND category_group = 'bil')
JOIN public.vehicle_brands b ON b.id = c.brand_id
ON CONFLICT (brand_id, name) DO NOTHING;
