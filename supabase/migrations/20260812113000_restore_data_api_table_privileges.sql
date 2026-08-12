-- The squashed baseline intentionally relies on RLS policies for row-level
-- access, but pg_dump did not preserve the Supabase Data API role grants.
-- Without these grants PostgREST fails before RLS can evaluate a request.

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL PRIVILEGES ON SEQUENCES TO service_role;

-- Defense in depth for tables that are intentionally server-only. Their RLS
-- policies already default-deny, but they should not be reachable through
-- PostgREST at all.
REVOKE ALL PRIVILEGES ON TABLE
  public.app_settings,
  public.error_log,
  public.listing_360_capture_sessions,
  public.listing_360_upload_rate_limits,
  public.listing_views,
  public.push_dispatch_failures,
  public.search_log_rate_limits,
  public.search_query_stats,
  public.vipps_webhook_events,
  public.vipps_webhook_secrets
FROM anon, authenticated;
