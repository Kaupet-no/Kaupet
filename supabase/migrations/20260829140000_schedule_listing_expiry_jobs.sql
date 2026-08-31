-- expire_old_listings() og expire_listing_promotions() har eksistert siden
-- baseline-squashen, men har aldri vært koblet til noen cron-jobb, trigger
-- eller RPC-kall fra appen. search_listings_page filtrerer kun på
-- listings.status = 'active' (ikke expires_at), så en annonse med utløpt
-- expires_at forble søkbar på ubestemt tid siden ingenting noensinne satte
-- status til 'expired'. Fremhevingsvisning (get_featured_listing_ids,
-- $kaupetCode.tsx, mine-annonser.index.tsx) sjekker allerede expires_at
-- direkte og var ikke berørt, men listing_promotions.status driftet likevel
-- fra virkeligheten uten dette. Samme mønster som den eksisterende
-- purge-expired-accounts-daily-jobben.
SELECT cron.schedule('expire-old-listings-hourly', '0 * * * *', 'SELECT public.expire_old_listings();');
SELECT cron.schedule('expire-listing-promotions-hourly', '0 * * * *', 'SELECT public.expire_listing_promotions();');
