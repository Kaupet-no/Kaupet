-- Logger utledet kjøretøyklassifisering per oppslag (kode, utledet
-- kategori-slug, konfidens) i tillegg til selve regnr-oppslaget som allerede
-- logges. Grunnlag for (a) å finne SVV-koder classifyVehicleCategory() ikke
-- takler ennå, og (b) å varsle ved avvikende klassifisering på gjentatte
-- oppslag av samme skilt (personlige kjennemerker overført mellom
-- kjøretøytyper) — se src/lib/vehicle-classification.ts.

ALTER TABLE public.vehicle_lookup_log
  ADD COLUMN classification_result JSONB;
