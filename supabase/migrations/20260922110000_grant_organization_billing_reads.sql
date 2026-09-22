-- The preceding migration defines superuser SELECT policies for these tables
-- but revokes the table privileges without restoring SELECT for authenticated.
-- Keep the policy as the row-level boundary; this only makes the intended
-- superuser read contract reachable through the Data API.
GRANT SELECT ON TABLE public.organization_billing_profiles,
  public.organization_location_subscriptions,
  public.organization_location_charge_periods TO authenticated;
