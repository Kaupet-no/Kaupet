-- no transaction

-- Add moderator role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'moderator';
