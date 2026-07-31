-- Fase 2.6 (alternativ B): lar admin-UI foreslå strukturerte filterverdier
-- (f.eks. "Apple"/"Samsung" for Mobiltelefon-kategoriens "brand"-attributt)
-- utledet fra hva som faktisk er lagt inn på annonser, i stedet for at noen
-- må sitte og skrive lister for hver av de ~50 kategoriene som i dag har
-- en fritekst "Merke"-attributt (se category_filters.type = 'text').
--
-- Generisk på attributtnøkkel (ikke hardkodet til "brand"), så samme verktøy
-- kan brukes til å strukturere andre fritekstfelt senere.
--
-- Case-insensitiv gruppering (så "iPhone"/"iphone" telles sammen), men
-- viser den mest brukte skrivemåten som forslagsverdi.
CREATE OR REPLACE FUNCTION public.suggest_attribute_values(
  p_category_id uuid,
  p_key text,
  p_limit int DEFAULT 20
)
RETURNS TABLE(value text, listing_count bigint)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT (array_agg(raw ORDER BY freq DESC))[1] AS value, sum(freq)::bigint AS listing_count
  FROM (
    SELECT
      trim(l.attributes->>p_key) AS raw,
      lower(trim(l.attributes->>p_key)) AS norm,
      count(*) AS freq
    FROM public.listings l
    WHERE l.category_id = p_category_id
      AND l.status = 'active'
      AND l.attributes ? p_key
      AND trim(l.attributes->>p_key) <> ''
    GROUP BY raw, norm
  ) grouped
  GROUP BY norm
  ORDER BY listing_count DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.suggest_attribute_values(uuid, text, int) TO authenticated;
