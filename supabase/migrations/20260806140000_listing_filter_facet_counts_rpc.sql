-- Per-value result counts for the /annonser filter panel (e.g. "Diesel 98").
-- Takes the same resolved constraints the client already computes for the
-- main listings query (category ids, conditions, price bounds, an optional
-- id allowlist from full-text/radius search) plus the currently active
-- attribute filters, and returns counts per candidate facet key/value. Each
-- facet key's own active filter is excluded from its own count (so picking
-- "Diesel" doesn't collapse the Diesel count to just itself) while every
-- *other* active filter still narrows it — standard faceted-search semantics.
CREATE OR REPLACE FUNCTION public.listing_filter_facet_counts(
  p_category_ids uuid[] DEFAULT NULL,
  p_conditions text[] DEFAULT NULL,
  p_price_min numeric DEFAULT NULL,
  p_price_max numeric DEFAULT NULL,
  p_include_free boolean DEFAULT true,
  p_listing_ids uuid[] DEFAULT NULL,
  p_active_attrs jsonb DEFAULT '{}'::jsonb,
  p_facet_keys text[] DEFAULT ARRAY[]::text[]
)
RETURNS TABLE(attr_key text, attr_value text, cnt bigint)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  base_where text;
  facet_key text;
  attr_key_iter text;
  attr_filter jsonb;
  kind text;
  extra_where text;
  sql text := '';
BEGIN
  base_where := 'l.status = ''active''';

  IF p_category_ids IS NOT NULL THEN
    base_where := base_where || format(' AND l.category_id = ANY(%L::uuid[])', p_category_ids);
  END IF;
  IF p_conditions IS NOT NULL AND array_length(p_conditions, 1) > 0 THEN
    base_where := base_where || format(' AND l.condition = ANY(%L::text[])', p_conditions);
  END IF;
  IF p_listing_ids IS NOT NULL THEN
    base_where := base_where || format(' AND l.id = ANY(%L::uuid[])', p_listing_ids);
  END IF;

  IF p_include_free THEN
    IF p_price_min IS NOT NULL THEN
      base_where := base_where || format(' AND (l.is_free OR l.price_nok >= %L)', p_price_min);
    END IF;
    IF p_price_max IS NOT NULL THEN
      base_where := base_where || format(' AND (l.is_free OR l.price_nok <= %L)', p_price_max);
    END IF;
  ELSE
    base_where := base_where || ' AND l.is_free = false';
    IF p_price_min IS NOT NULL THEN
      base_where := base_where || format(' AND l.price_nok >= %L', p_price_min);
    END IF;
    IF p_price_max IS NOT NULL THEN
      base_where := base_where || format(' AND l.price_nok <= %L', p_price_max);
    END IF;
  END IF;

  FOREACH facet_key IN ARRAY p_facet_keys LOOP
    extra_where := '';
    FOR attr_key_iter, attr_filter IN SELECT * FROM jsonb_each(p_active_attrs) LOOP
      IF attr_key_iter = facet_key THEN
        CONTINUE;
      END IF;
      kind := attr_filter->>'kind';
      CASE kind
        WHEN 'select' THEN
          extra_where := extra_where || format(
            ' AND l.attributes @> %L::jsonb',
            jsonb_build_object(attr_key_iter, attr_filter->>'value')
          );
        WHEN 'boolean' THEN
          extra_where := extra_where || format(
            ' AND l.attributes @> %L::jsonb',
            jsonb_build_object(attr_key_iter, (attr_filter->>'value')::boolean)
          );
        WHEN 'multiselect' THEN
          extra_where := extra_where || format(
            ' AND l.attributes->>%L = ANY(%L::text[])',
            attr_key_iter,
            ARRAY(SELECT jsonb_array_elements_text(attr_filter->'values'))
          );
        WHEN 'range' THEN
          IF attr_filter ? 'min' THEN
            extra_where := extra_where || format(
              ' AND (l.attributes->>%L)::numeric >= %L',
              attr_key_iter, (attr_filter->>'min')::numeric
            );
          END IF;
          IF attr_filter ? 'max' THEN
            extra_where := extra_where || format(
              ' AND (l.attributes->>%L)::numeric <= %L',
              attr_key_iter, (attr_filter->>'max')::numeric
            );
          END IF;
        WHEN 'text' THEN
          extra_where := extra_where || format(
            ' AND l.attributes->>%L ILIKE %L',
            attr_key_iter, '%' || (attr_filter->>'value') || '%'
          );
        WHEN 'exclude' THEN
          extra_where := extra_where || format(
            ' AND (l.attributes->>%L IS NULL OR l.attributes->>%L <> ALL(%L::text[]))',
            attr_key_iter, attr_key_iter,
            ARRAY(SELECT jsonb_array_elements_text(attr_filter->'values'))
          );
        ELSE
          NULL;
      END CASE;
    END LOOP;

    sql := sql || format(
      'SELECT %L::text AS attr_key, l.attributes->>%L AS attr_value, count(*) AS cnt
       FROM public.listings l
       WHERE %s AND l.attributes ? %L%s
       GROUP BY l.attributes->>%L',
      facet_key, facet_key, base_where, facet_key, extra_where, facet_key
    );
    sql := sql || ' UNION ALL ';
  END LOOP;

  IF sql = '' THEN
    RETURN;
  END IF;
  sql := left(sql, length(sql) - length(' UNION ALL '));

  RETURN QUERY EXECUTE sql;
END;
$$;
