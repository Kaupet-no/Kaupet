-- Ny filtertype «date»: ISO-dato (yyyy-MM-dd) som fylles inn med datovelger
-- og søkes som tidligste dato (AttributeFilterValue «date_min»). Erstatter
-- nøkkelbaserte spesialtilfeller for next_eu_control i den generiske koden.
--
-- Etiketten settes tilbake til den nøytrale «Neste EU-kontroll» (den ble
-- endret til søketeksten i 20260807120000): den vises også i
-- annonseopprettelsen, og søk/ønskeliste lager sin egen «(tidligst)»-tekst.

ALTER TABLE public.category_filters DROP CONSTRAINT category_filters_type_check;
ALTER TABLE public.category_filters ADD CONSTRAINT category_filters_type_check
  CHECK (type = ANY (ARRAY[
    'select', 'multiselect', 'number', 'range', 'boolean', 'text',
    'brand_select', 'model_select', 'date'
  ]));

UPDATE public.category_filters
SET type = 'date', label_nb = 'Neste EU-kontroll'
WHERE key = 'next_eu_control';
