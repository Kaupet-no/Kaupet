-- Retter to feil i Mercedes-Benz-testdataen fra 20260803160000:
-- 1. "EQ (elbil)" var feilaktig én klasse med EQA/EQB/EQC/EQE/EQS/EQV som
--    modeller under den — i virkeligheten er hver EQ-serie sin egen klasse
--    (på linje med GLA/GLB/GLC/GLE/GLS), med egne modellvarianter under seg.
-- 2. "Andre" (Sprinter, Citan) er ikke en modellklasse i det hele tatt — disse
--    er selvstendige Mercedes-Benz-modeller uten klassetilhørighet, akkurat
--    som de aller fleste andre merkers modeller.

DO $$
DECLARE
  _brand_id uuid;
BEGIN
  SELECT id INTO _brand_id FROM public.vehicle_brands
  WHERE name = 'Mercedes-Benz' AND category_group = 'bil';

  IF _brand_id IS NULL THEN
    RETURN;
  END IF;

  -- 1. EQ-seriene blir egne klasser.
  INSERT INTO public.vehicle_model_classes (brand_id, name, status)
  SELECT _brand_id, v.class_name, 'approved'
  FROM (VALUES ('EQA'), ('EQB'), ('EQC'), ('EQE'), ('EQS'), ('EQV')) AS v(class_name)
  ON CONFLICT (brand_id, name) DO NOTHING;

  -- De gamle "EQA"/"EQB"/... radene under "EQ (elbil)" representerte
  -- egentlig klassenavn, ikke modeller — fjern dem før de riktige
  -- modellvariantene settes inn under de nye klassene.
  DELETE FROM public.vehicle_models
  WHERE brand_id = _brand_id
    AND name IN ('EQA', 'EQB', 'EQC', 'EQE', 'EQS', 'EQV')
    AND class_id = (
      SELECT id FROM public.vehicle_model_classes
      WHERE brand_id = _brand_id AND name = 'EQ (elbil)'
    );

  INSERT INTO public.vehicle_models (brand_id, class_id, name, status)
  SELECT _brand_id, c.id, v.model, 'approved'
  FROM (VALUES
    ('EQA', 'EQA250'), ('EQA', 'EQA300 4MATIC'), ('EQA', 'EQA350 4MATIC'),
    ('EQB', 'EQB250'), ('EQB', 'EQB300 4MATIC'), ('EQB', 'EQB350 4MATIC'),
    ('EQC', 'EQC400 4MATIC'),
    ('EQE', 'EQE300'), ('EQE', 'EQE350'), ('EQE', 'EQE500 4MATIC'),
    ('EQS', 'EQS450'), ('EQS', 'EQS500 4MATIC'), ('EQS', 'EQS580 4MATIC'),
    ('EQV', 'EQV300')
  ) AS v(class_name, model)
  JOIN public.vehicle_model_classes c ON c.name = v.class_name AND c.brand_id = _brand_id
  ON CONFLICT (brand_id, name) DO NOTHING;

  -- Den nå tomme "EQ (elbil)"-klassen fjernes.
  DELETE FROM public.vehicle_model_classes
  WHERE brand_id = _brand_id AND name = 'EQ (elbil)';

  -- 2. Sprinter/Citan mister klassetilhørigheten sin ("Andre" var ikke en
  -- reell klasse), og den tomme "Andre"-klassen fjernes.
  UPDATE public.vehicle_models
  SET class_id = NULL
  WHERE brand_id = _brand_id AND name IN ('Sprinter', 'Citan');

  DELETE FROM public.vehicle_model_classes
  WHERE brand_id = _brand_id AND name = 'Andre';
END $$;
