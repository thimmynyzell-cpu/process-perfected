-- One base checklist per category (folder) instead of one per organization.
-- A base checklist without category is the general one.
DROP INDEX IF EXISTS public.templates_one_base_per_org;
CREATE UNIQUE INDEX IF NOT EXISTS templates_one_base_per_category
  ON public.templates (org_id, coalesce(category, '')) WHERE is_base;
