
REVOKE EXECUTE ON FUNCTION public.admin_overview_stats() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_popular_listings(int) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_popular_categories() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_views_timeseries(int) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_find_users_by_email(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_grant_role(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_role(uuid) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.admin_overview_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_popular_listings(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_popular_categories() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_views_timeseries(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_find_users_by_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_role(uuid) TO authenticated;
