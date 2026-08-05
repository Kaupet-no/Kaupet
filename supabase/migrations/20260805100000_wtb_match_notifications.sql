-- Fase 1 av ØK-matching: notifikasjonstabell + varslingspreferanser.
-- Speiler saved_search_notifications (samme mønster: unik per par, RLS på
-- eier, REPLICA IDENTITY FULL for Realtime i notifications-bell.tsx), men i
-- motsatt retning — her er det en wtb_listings-rad (kjøpers kriterier) som
-- matcher en ny/endret listings-rad (selgers annonse).
CREATE TABLE public.wtb_match_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    wtb_listing_id uuid NOT NULL,
    user_id uuid NOT NULL,
    listing_id uuid NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.wtb_match_notifications
    ADD CONSTRAINT wtb_match_notifications_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.wtb_match_notifications
    ADD CONSTRAINT wtb_match_notifications_wtb_listing_id_listing_id_key
    UNIQUE (wtb_listing_id, listing_id);

ALTER TABLE ONLY public.wtb_match_notifications
    ADD CONSTRAINT wtb_match_notifications_wtb_listing_id_fkey
    FOREIGN KEY (wtb_listing_id) REFERENCES public.wtb_listings(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.wtb_match_notifications
    ADD CONSTRAINT wtb_match_notifications_listing_id_fkey
    FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.wtb_match_notifications
    ADD CONSTRAINT wtb_match_notifications_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.wtb_match_notifications REPLICA IDENTITY FULL;

CREATE INDEX wtb_match_notifications_user_unread_idx
    ON public.wtb_match_notifications USING btree (user_id, read_at, created_at DESC);

CREATE INDEX wtb_match_notifications_wtb_listing_id_idx
    ON public.wtb_match_notifications USING btree (wtb_listing_id);

ALTER TABLE public.wtb_match_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own wtb match notifications" ON public.wtb_match_notifications
    FOR SELECT TO authenticated USING ((auth.uid() = user_id));

CREATE POLICY "Users update own wtb match notifications" ON public.wtb_match_notifications
    FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users delete own wtb match notifications" ON public.wtb_match_notifications
    FOR DELETE TO authenticated USING ((auth.uid() = user_id));

-- Per-type push/e-post-preferanser, samme mønster som *_saved_searches.
ALTER TABLE public.notification_preferences
    ADD COLUMN IF NOT EXISTS web_push_wtb_matches boolean DEFAULT true NOT NULL,
    ADD COLUMN IF NOT EXISTS email_wtb_matches boolean DEFAULT false NOT NULL;
