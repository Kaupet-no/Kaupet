
-- 1) Admin-only SELECT policy on listing_views (visitor_key is sensitive)
CREATE POLICY "Admins can view listing views"
  ON public.listing_views
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2) Revoke broad EXECUTE on SECURITY DEFINER functions, then grant
--    only to the roles that actually need to call them.
--
-- Trigger functions: no grants needed (the trigger system invokes them).
REVOKE ALL ON FUNCTION public.set_updated_at()                          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user()                         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.listings_search_vector_trigger()          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.listings_match_saved_searches_trigger()   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dispatch_push_for_message()               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dispatch_push_for_saved_search()          FROM PUBLIC, anon, authenticated;

-- Internal helper called from triggers / other functions only.
REVOKE ALL ON FUNCTION public.match_listing_to_saved_searches(uuid) FROM PUBLIC, anon, authenticated;

-- Background maintenance: service_role / cron only.
REVOKE ALL ON FUNCTION public.purge_expired_accounts() FROM PUBLIC, anon, authenticated;

-- has_role is called from RLS policy expressions and runs as the current user;
-- authenticated users need EXECUTE so policies can evaluate. Anon does not.
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

-- User-callable functions: authenticated only.
REVOKE ALL ON FUNCTION public.request_account_deletion(text)   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_account_deletion(text) TO authenticated;

REVOKE ALL ON FUNCTION public.cancel_account_deletion()        FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_account_deletion()     TO authenticated;

REVOKE ALL ON FUNCTION public.is_user_deletion_pending(uuid)   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_user_deletion_pending(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.listing_stats(uuid)              FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listing_stats(uuid)           TO authenticated;

-- Plain (non-definer) helper used by anon and authenticated for search radius.
REVOKE ALL ON FUNCTION public.listings_within_radius(double precision, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listings_within_radius(double precision, double precision, double precision) TO anon, authenticated;

-- Admin-only RPCs: still SECURITY DEFINER with internal has_role checks,
-- but limit EXECUTE to authenticated so anon cannot even attempt the call.
REVOKE ALL ON FUNCTION public.admin_views_timeseries(integer)  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_views_timeseries(integer) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_grant_role(uuid)           FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_role(uuid)        TO authenticated;

REVOKE ALL ON FUNCTION public.admin_revoke_role(uuid)          FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_role(uuid)       TO authenticated;

REVOKE ALL ON FUNCTION public.admin_popular_categories()       FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_popular_categories()    TO authenticated;

REVOKE ALL ON FUNCTION public.admin_popular_listings(integer)  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_popular_listings(integer) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_overview_stats()           FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_overview_stats()        TO authenticated;

REVOKE ALL ON FUNCTION public.admin_find_users_by_email(text)  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_find_users_by_email(text) TO authenticated;
