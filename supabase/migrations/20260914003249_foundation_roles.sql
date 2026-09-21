-- Generated with Supabase CLI, ordered after the pre-existing v0.1 migration.
-- Enum values must be committed before use in the following migration.
alter type public.organization_role add value if not exists 'owner';
alter type public.organization_role add value if not exists 'admin';
