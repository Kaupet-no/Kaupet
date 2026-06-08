
-- Revoke EXECUTE from anon (and PUBLIC) on all SECURITY DEFINER functions in public schema.
-- Re-grant to authenticated only for functions that legitimately need to be callable
-- by signed-in users (via RLS policies, RPCs, or direct calls).

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon',
                   r.proname, r.args);
  END LOOP;
END $$;

-- Re-grant EXECUTE to authenticated for functions needed by signed-in users / RLS policies.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_blocked_between(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_banned(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_suspended(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_ip_banned(inet) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_deletion_pending(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_moderation_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_listing_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.listing_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_account_deletion(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_account_deletion() TO authenticated;

-- Admin-only RPCs — admin check happens inside the function, but they must still be callable by authenticated.
GRANT EXECUTE ON FUNCTION public.admin_export_user_data(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_find_users_by_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_views_timeseries(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_popular_categories() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_popular_listings(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_overview_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_search_listings(text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_moderation_log(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_bans() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_suspensions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_ip_bans() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ban_user(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unban_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_suspend_user(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unsuspend_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ban_ip(inet, text, timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unban_ip(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_enable_listing(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_disable_listing(uuid, text) TO authenticated;

-- Maintenance / cron-only functions (purge, expire, dispatch_*): keep restricted to service_role.
GRANT EXECUTE ON FUNCTION public.purge_expired_accounts() TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_old_listings() TO service_role;
GRANT EXECUTE ON FUNCTION public.match_listing_to_saved_searches(uuid) TO service_role;
