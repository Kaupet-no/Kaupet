-- Herreklær og dameklær bruker begge Shirt-ikonet i stedet for de
-- egendefinerte SuitJacket/Dress-ikonene satt i
-- 20260723100000_category_level2_icons.sql.
update categories set icon = 'Shirt'
where parent_id is not null
  and slug in ('herreklaer', 'dameklaer');
