-- Appen abonnerer på postgres_changes for meldinger og alle varseltabellene
-- (use-unread.ts, notifications-bell.tsx), men publiseringen var bare satt
-- opp i Supabase-dashbordet. Uten tabellen i `supabase_realtime` blir
-- abonnementet stille en tom kanal — slik «favoritt solgt» risikerte å bli.
-- Idempotent: tabeller som allerede er med (lagt til i dashbordet) hoppes over.
DO $$
DECLARE
  _table text;
BEGIN
  FOREACH _table IN ARRAY ARRAY[
    'messages',
    'saved_search_notifications',
    'favorite_price_drops',
    'favorite_sold_notifications',
    'wtb_match_notifications'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = _table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', _table);
    END IF;
  END LOOP;
END
$$;
