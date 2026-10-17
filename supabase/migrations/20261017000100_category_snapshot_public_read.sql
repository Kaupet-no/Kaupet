-- KG-06-F02: produksjonens staging-klient bruker publishable key (anon).
-- Behold SECURITY INVOKER: snapshotet har samme offentlige lesetilgang som tabellene.
GRANT EXECUTE ON FUNCTION public.category_sync_snapshot() TO anon, authenticated;
