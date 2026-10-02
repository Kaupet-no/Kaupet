CREATE OR REPLACE FUNCTION public.register_standard_upload_object(_bucket text, _key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.standard_upload_objects (bucket, object_key)
  VALUES (_bucket, _key)
  ON CONFLICT (bucket, object_key) DO UPDATE
    SET created_at = clock_timestamp()
    WHERE standard_upload_objects.state = 'ready';
  IF NOT FOUND THEN RAISE EXCEPTION 'R2-objektet er under opprydding'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.register_standard_upload_object(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_standard_upload_object(text, text) TO service_role;
