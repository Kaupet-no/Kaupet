DROP POLICY IF EXISTS "Reviews are viewable by everyone" ON public.user_reviews;

CREATE POLICY "Authenticated users can view reviews"
ON public.user_reviews
FOR SELECT
TO authenticated
USING (true);

REVOKE SELECT ON public.user_reviews FROM anon;