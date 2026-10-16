-- Stable question identity across versions (item_key), and a link from a
-- copied question to the base checklist question it came from (base_key).
ALTER TABLE public.template_items ADD COLUMN IF NOT EXISTS item_key uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.template_items ADD COLUMN IF NOT EXISTS base_key uuid;

CREATE OR REPLACE FUNCTION public.clone_template_version(p_template_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid(); t record; src uuid; new_v uuid; next_version integer;
BEGIN
  SELECT * INTO t FROM public.templates WHERE id = p_template_id;
  IF t IS NULL THEN RAISE EXCEPTION 'Template not found'; END IF;
  IF NOT public.has_org_role(t.org_id, ARRAY['admin','manager']::public.app_role[]) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT id INTO src FROM public.template_versions WHERE template_id = p_template_id ORDER BY version DESC LIMIT 1;
  next_version := t.current_version + 1;
  INSERT INTO public.template_versions (template_id, org_id, version, created_by)
  VALUES (p_template_id, t.org_id, next_version, uid) RETURNING id INTO new_v;
  INSERT INTO public.template_items (version_id, org_id, section, position, type, label, help_text, required, allow_note, allow_photo, options, parent_position, show_when, jump_to, levels, item_key, base_key)
  SELECT new_v, org_id, section, position, type, label, help_text, required, allow_note, allow_photo, options, parent_position, show_when, jump_to, levels, item_key, base_key
  FROM public.template_items WHERE version_id = src;
  UPDATE public.templates SET current_version = next_version, updated_at = now() WHERE id = p_template_id;
  RETURN new_v;
END;
$function$;
