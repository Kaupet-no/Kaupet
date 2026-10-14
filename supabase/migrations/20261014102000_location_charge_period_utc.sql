-- KG-11-F03: månedsaritmetikken (timestamptz + make_interval(months)) skjer i
-- øktas TimeZone. Forhåndsvisningen i adminListLocationCharges speiler den i
-- UTC (addMonthsClampedUtc), så funksjonen festes til UTC i stedet for å
-- avhenge av database-/rolleinnstillingen.
ALTER FUNCTION public.mark_organization_location_charge_invoiced(uuid, timestamptz, text)
  SET timezone = 'UTC';
