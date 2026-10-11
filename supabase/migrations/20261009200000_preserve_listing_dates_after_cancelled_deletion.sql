-- Restoring a protected deletion snapshot resumes the original publication period.
-- Ordinary publication and renewal still receive a fresh 30-day period.
CREATE OR REPLACE FUNCTION public.listings_set_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' THEN
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active' THEN
      IF TG_OP = 'UPDATE' AND OLD.status = 'archived' AND EXISTS (
        SELECT 1
        FROM public.account_deletions d
        CROSS JOIN LATERAL jsonb_array_elements(d.listing_states) s(value)
        WHERE d.user_id = auth.uid() AND d.user_id = NEW.seller_id
          AND d.scheduled_purge_at > now()
          AND s.value->>'id' = NEW.id::text AND s.value->>'status' = 'active'
      ) THEN
        NEW.published_at := OLD.published_at;
        NEW.expires_at := OLD.expires_at;
      ELSE
        NEW.published_at := now();
        NEW.expires_at := now() + interval '30 days';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.listings_set_expiry() FROM PUBLIC, anon, authenticated, service_role;
