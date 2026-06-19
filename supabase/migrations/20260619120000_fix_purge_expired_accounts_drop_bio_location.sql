-- purge_expired_accounts() refererte fortsatt til profiles.bio/profiles.location,
-- som ble fjernet i 20260618120000_remove_profile_location_bio.sql. Dette fikk
-- den daglige pg_cron-jobben til å feile ved kjøretid siden den UPDATE-setningen.
CREATE OR REPLACE FUNCTION public.purge_expired_accounts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _count integer := 0;
  _row record;
BEGIN
  FOR _row IN
    SELECT user_id FROM public.account_deletions WHERE scheduled_purge_at <= now()
  LOOP
    -- Remove the user's own listings (cascade removes listing_images, favorites refs, conversations, messages, etc.)
    DELETE FROM public.listings WHERE seller_id = _row.user_id;

    -- Anonymize profile so messages/conversations still show a name
    UPDATE public.profiles
       SET display_name = 'Slettet bruker',
           avatar_url = NULL,
           deleted_at = now(),
           updated_at = now()
     WHERE id = _row.user_id;

    -- Finally remove auth user; profiles/conversations/messages no longer FK-cascade
    DELETE FROM auth.users WHERE id = _row.user_id;

    _count := _count + 1;
  END LOOP;
  RETURN _count;
END;
$function$;
