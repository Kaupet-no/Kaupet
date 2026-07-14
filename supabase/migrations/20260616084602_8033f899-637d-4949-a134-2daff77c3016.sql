-- 1. Generator function
CREATE OR REPLACE FUNCTION public.generate_kaupet_code()
RETURNS char(8)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _code char(8);
  _attempt int := 0;
BEGIN
  LOOP
    _attempt := _attempt + 1;
    -- 8 random digits, zero-padded
    _code := lpad(((random() * 100000000)::bigint % 100000000)::text, 8, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.listings WHERE kaupet_code = _code);
    IF _attempt > 20 THEN
      RAISE EXCEPTION 'Kunne ikke generere unik Kaupet-kode etter 20 forsøk';
    END IF;
  END LOOP;
  RETURN _code;
END;
$$;

-- 2. Add column (nullable first for backfill)
ALTER TABLE public.listings ADD COLUMN kaupet_code char(8);

-- 3. Backfill existing rows
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.listings WHERE kaupet_code IS NULL LOOP
    UPDATE public.listings SET kaupet_code = public.generate_kaupet_code() WHERE id = r.id;
  END LOOP;
END $$;

-- 4. Enforce NOT NULL, UNIQUE, format
ALTER TABLE public.listings ALTER COLUMN kaupet_code SET NOT NULL;
ALTER TABLE public.listings ADD CONSTRAINT listings_kaupet_code_unique UNIQUE (kaupet_code);
ALTER TABLE public.listings ADD CONSTRAINT listings_kaupet_code_format CHECK (kaupet_code ~ '^[0-9]{8}$');

-- 5. Trigger to assign on insert when NULL
CREATE OR REPLACE FUNCTION public.listings_assign_kaupet_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.kaupet_code IS NULL THEN
    NEW.kaupet_code := public.generate_kaupet_code();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER listings_assign_kaupet_code_trigger
  BEFORE INSERT ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.listings_assign_kaupet_code();