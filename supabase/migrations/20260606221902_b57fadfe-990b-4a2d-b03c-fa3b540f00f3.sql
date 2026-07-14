
CREATE OR REPLACE FUNCTION public.admin_export_user_data(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result jsonb;
  _email text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT email INTO _email FROM auth.users WHERE id = _user_id;

  _result := jsonb_build_object(
    'generated_at', now(),
    'generated_by_admin_id', auth.uid(),
    'user_id', _user_id,
    'auth', (
      SELECT jsonb_build_object(
        'email', u.email,
        'created_at', u.created_at,
        'last_sign_in_at', u.last_sign_in_at,
        'email_confirmed_at', u.email_confirmed_at
      )
      FROM auth.users u WHERE u.id = _user_id
    ),
    'profile', (
      SELECT to_jsonb(p) FROM public.profiles p WHERE p.id = _user_id
    ),
    'roles', COALESCE((
      SELECT jsonb_agg(to_jsonb(r)) FROM public.user_roles r WHERE r.user_id = _user_id
    ), '[]'::jsonb),
    'listings', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(l) || jsonb_build_object(
          'images', COALESCE((
            SELECT jsonb_agg(to_jsonb(i) ORDER BY i.sort_order)
            FROM public.listing_images i WHERE i.listing_id = l.id
          ), '[]'::jsonb)
        )
      )
      FROM public.listings l WHERE l.seller_id = _user_id
    ), '[]'::jsonb),
    'favorites', COALESCE((
      SELECT jsonb_agg(to_jsonb(f)) FROM public.favorites f WHERE f.user_id = _user_id
    ), '[]'::jsonb),
    'conversations', COALESCE((
      SELECT jsonb_agg(to_jsonb(c))
      FROM public.conversations c
      WHERE c.buyer_id = _user_id OR c.seller_id = _user_id
    ), '[]'::jsonb),
    'messages', COALESCE((
      SELECT jsonb_agg(to_jsonb(m))
      FROM public.messages m
      WHERE m.sender_id = _user_id
         OR m.conversation_id IN (
           SELECT c.id FROM public.conversations c
           WHERE c.buyer_id = _user_id OR c.seller_id = _user_id
         )
    ), '[]'::jsonb),
    'reviews_given', COALESCE((
      SELECT jsonb_agg(to_jsonb(r)) FROM public.user_reviews r WHERE r.reviewer_id = _user_id
    ), '[]'::jsonb),
    'reviews_received', COALESCE((
      SELECT jsonb_agg(to_jsonb(r)) FROM public.user_reviews r WHERE r.reviewee_id = _user_id
    ), '[]'::jsonb),
    'reports_submitted', COALESCE((
      SELECT jsonb_agg(to_jsonb(r)) FROM public.reports r WHERE r.reporter_id = _user_id
    ), '[]'::jsonb),
    'blocks', COALESCE((
      SELECT jsonb_agg(to_jsonb(b)) FROM public.user_blocks b WHERE b.blocker_id = _user_id
    ), '[]'::jsonb),
    'saved_searches', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(s) || jsonb_build_object(
          'notifications', COALESCE((
            SELECT jsonb_agg(to_jsonb(n))
            FROM public.saved_search_notifications n
            WHERE n.saved_search_id = s.id
          ), '[]'::jsonb)
        )
      )
      FROM public.saved_searches s WHERE s.user_id = _user_id
    ), '[]'::jsonb),
    'sales', COALESCE((
      SELECT jsonb_agg(to_jsonb(s))
      FROM public.listing_sales s
      WHERE s.buyer_id = _user_id OR s.seller_id = _user_id
    ), '[]'::jsonb),
    'notification_preferences', (
      SELECT to_jsonb(np) FROM public.notification_preferences np WHERE np.user_id = _user_id
    ),
    'push_subscriptions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ps.id,
        'endpoint', ps.endpoint,
        'user_agent', ps.user_agent,
        'created_at', ps.created_at,
        'last_used_at', ps.last_used_at
      ))
      FROM public.push_subscriptions ps WHERE ps.user_id = _user_id
    ), '[]'::jsonb),
    'moderation', jsonb_build_object(
      'bans', COALESCE((
        SELECT jsonb_agg(to_jsonb(b)) FROM public.user_bans b WHERE b.user_id = _user_id
      ), '[]'::jsonb),
      'suspensions', COALESCE((
        SELECT jsonb_agg(to_jsonb(s)) FROM public.user_suspensions s WHERE s.user_id = _user_id
      ), '[]'::jsonb),
      'admin_actions_against_user', COALESCE((
        SELECT jsonb_agg(to_jsonb(l))
        FROM public.admin_moderation_log l
        WHERE l.target_type = 'user' AND l.target_id = _user_id::text
      ), '[]'::jsonb)
    ),
    'account_deletion', (
      SELECT to_jsonb(ad) FROM public.account_deletions ad WHERE ad.user_id = _user_id
    ),
    'listing_view_counts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'listing_id', l.id,
        'title', l.title,
        'total_views', (SELECT count(*) FROM public.listing_views v WHERE v.listing_id = l.id)
      ))
      FROM public.listings l WHERE l.seller_id = _user_id
    ), '[]'::jsonb)
  );

  INSERT INTO public.admin_moderation_log(admin_id, action, target_type, target_id, reason)
  VALUES (auth.uid(), 'export_user_data', 'user', _user_id::text, COALESCE(_email, ''));

  RETURN _result;
END;
$$;
