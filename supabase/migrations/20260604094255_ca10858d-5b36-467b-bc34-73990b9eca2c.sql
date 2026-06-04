UPDATE public.listings
SET lat = 59.9326, lng = 10.9577
WHERE id = '6d73dd7c-a94f-4418-8fac-f5fef61bf68a'
  AND lat IS NULL
  AND lng IS NULL;