-- 20260803130000 granted EXECUTE on the listings stats trigger functions but
-- deletion still failed: `listing_category_word_stats` and
-- `listing_keyword_stats` only have a SELECT RLS policy ("viewable by
-- everyone"), no INSERT/UPDATE policy. The trigger functions are not
-- SECURITY DEFINER, so their internal UPDATE/INSERT statements run under
-- the invoking role's RLS (supabase_auth_admin during a cascading
-- auth.users delete, or authenticated/service_role for ordinary listing
-- deletion) and get blocked since no write policy exists for that role.
-- Marking them SECURITY DEFINER makes them run as the function owner
-- (postgres), which bypasses RLS as the table owner — matching the pattern
-- already used by suggest_category_for_title/suggest_keywords_for_listing
-- in the same files. search_path is already pinned to `public` in both
-- functions, so this doesn't introduce a search_path hijacking risk.
ALTER FUNCTION public.listings_update_category_word_stats() SECURITY DEFINER;
ALTER FUNCTION public.listings_remove_category_word_stats() SECURITY DEFINER;
ALTER FUNCTION public.listings_update_keyword_stats() SECURITY DEFINER;
ALTER FUNCTION public.listings_remove_keyword_stats() SECURITY DEFINER;
