
-- 1. Conversations UPDATE: prevent altering identity columns
DROP POLICY IF EXISTS "Participants can update conversations" ON public.conversations;
CREATE POLICY "Participants can update conversations"
ON public.conversations
FOR UPDATE
TO authenticated
USING ((auth.uid() = buyer_id) OR (auth.uid() = seller_id))
WITH CHECK (
  ((auth.uid() = buyer_id) OR (auth.uid() = seller_id))
  AND buyer_id = (SELECT c.buyer_id FROM public.conversations c WHERE c.id = conversations.id)
  AND seller_id = (SELECT c.seller_id FROM public.conversations c WHERE c.id = conversations.id)
  AND listing_id = (SELECT c.listing_id FROM public.conversations c WHERE c.id = conversations.id)
);

-- 2. user_reviews: make publicly viewable (shown on public profiles)
DROP POLICY IF EXISTS "Authenticated users can view reviews" ON public.user_reviews;
CREATE POLICY "Reviews are viewable by everyone"
ON public.user_reviews
FOR SELECT
TO anon, authenticated
USING (true);

-- 3. vipps_oauth_states: explicit deny policies (service role bypasses RLS)
CREATE POLICY "No client access to vipps_oauth_states - select"
ON public.vipps_oauth_states FOR SELECT TO anon, authenticated USING (false);
CREATE POLICY "No client access to vipps_oauth_states - insert"
ON public.vipps_oauth_states FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "No client access to vipps_oauth_states - update"
ON public.vipps_oauth_states FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "No client access to vipps_oauth_states - delete"
ON public.vipps_oauth_states FOR DELETE TO anon, authenticated USING (false);

-- 4. Revoke anonymous EXECUTE on SECURITY DEFINER functions that should be auth-only
REVOKE EXECUTE ON FUNCTION public.admin_ban_ip(inet, text, timestamptz) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_ban_user(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_disable_listing(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_enable_listing(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_list_bans() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_list_ip_bans() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_list_moderation_log(integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_list_suspensions() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_search_listings(text, text, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_suspend_user(uuid, text, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_unban_ip(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_unban_user(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_unsuspend_user(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_blocked_between(uuid, uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_ip_banned(inet) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_user_banned(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_user_suspended(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.conversations_enforce_moderation() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.listings_enforce_moderation() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.messages_enforce_moderation() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.my_listing_counts() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.my_moderation_status() FROM anon, public;
