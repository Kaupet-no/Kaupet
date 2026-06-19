-- Superseded by 20260619130000_add_category_icon.sql, which adds the same
-- column with a data backfill. Made idempotent so replay/push order
-- doesn't fail when both migrations run in the same batch.
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS icon TEXT;
