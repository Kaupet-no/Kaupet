-- 20260622120000_category_word_stats.sql and 20260624120000_listing_keyword_stats.sql
-- each revoke EXECUTE on their listings trigger functions from PUBLIC, anon, and
-- authenticated (intended to stop those roles calling the functions directly), but
-- never re-grant EXECUTE to any role. Since REVOKE ... FROM PUBLIC removes the
-- default execute grant every role gets, this also strips execute rights from
-- supabase_auth_admin (which fires the AFTER DELETE triggers while cascading a
-- `DELETE FROM auth.users`) and from `authenticated`/`service_role` (which fire
-- them on ordinary listing deletion from the app). The trigger functions still
-- need to run automatically as part of DML on public.listings — only direct,
-- explicit invocation by end users needed blocking, which RLS/API surface
-- already prevents since these functions are never exposed via PostgREST.
GRANT EXECUTE ON FUNCTION public.listings_update_category_word_stats()
  TO supabase_auth_admin, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.listings_remove_category_word_stats()
  TO supabase_auth_admin, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.listings_update_keyword_stats()
  TO supabase_auth_admin, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.listings_remove_keyword_stats()
  TO supabase_auth_admin, authenticated, service_role;
