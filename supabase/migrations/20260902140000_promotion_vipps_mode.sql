-- listing_promotions must remember which Vipps environment (test/production)
-- a payment was created in. Reconcile/capture/refund/webhook previously
-- re-derived the environment from the *current* request instead of the
-- transaction, which let the same reference be processed against the wrong
-- environment depending on who triggered it. See docs/SIKKERHETSVURDERING.md K-1.

-- Nullable: gifted promotions (is_gift = true) never touch Vipps and have no
-- meaningful mode. Anything with a vipps_reference must set it.
alter table public.listing_promotions
  add column vipps_mode text
    check (vipps_mode in ('test', 'production'));

update public.listing_promotions
  set vipps_mode = 'production'
  where vipps_reference is not null and vipps_mode is null;

alter table public.listing_promotions
  add constraint listing_promotions_vipps_mode_required
    check (vipps_reference is null or vipps_mode is not null);
