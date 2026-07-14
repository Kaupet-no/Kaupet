
-- Anonymize-on-purge: keep profiles/conversations/messages alive after auth user deletion

-- 1) Add deleted_at to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 2) Drop FKs to auth.users that would CASCADE away content we want to keep
ALTER TABLE public.profiles      DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_buyer_id_fkey;
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_seller_id_fkey;
ALTER TABLE public.messages      DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;

-- 3) Helper: is a user pending deletion?
CREATE OR REPLACE FUNCTION public.is_user_deletion_pending(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.account_deletions WHERE user_id = _user_id);
$$;

GRANT EXECUTE ON FUNCTION public.is_user_deletion_pending(uuid) TO authenticated, anon;

-- 4) Rewrite purge_expired_accounts to anonymize instead of cascading away history
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
           bio = NULL,
           avatar_url = NULL,
           location = NULL,
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
