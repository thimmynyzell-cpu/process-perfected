-- One base checklist per organization. Its items are copied into every new
-- template when it is created.
ALTER TABLE public.templates ADD COLUMN is_base boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX templates_one_base_per_org ON public.templates (org_id) WHERE is_base;
