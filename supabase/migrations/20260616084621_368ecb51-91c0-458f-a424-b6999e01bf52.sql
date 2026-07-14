ALTER TABLE public.listings ALTER COLUMN kaupet_code SET DEFAULT public.generate_kaupet_code();
DROP TRIGGER IF EXISTS listings_assign_kaupet_code_trigger ON public.listings;