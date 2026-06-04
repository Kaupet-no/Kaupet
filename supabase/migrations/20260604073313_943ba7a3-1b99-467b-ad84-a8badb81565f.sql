
-- Listing image storage policies
CREATE POLICY "Listing images are publicly readable" ON storage.objects FOR SELECT
  USING (bucket_id = 'listing-images');

CREATE POLICY "Users can upload to their own listing folder" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'listing-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update their own listing images" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'listing-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete their own listing images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'listing-images' AND (storage.foldername(name))[1] = auth.uid()::text);
