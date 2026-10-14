-- Soft delete for templates: deleting schedules the template for permanent
-- removal after 10 days. Until then it can be restored.
ALTER TABLE public.templates ADD COLUMN delete_after timestamptz;

CREATE INDEX templates_delete_after_idx ON public.templates (delete_after) WHERE delete_after IS NOT NULL;

-- Permanently removes templates whose grace period has passed. Runs, versions
-- and items follow via ON DELETE CASCADE.
CREATE OR REPLACE FUNCTION public.purge_expired_templates()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  n integer;
BEGIN
  DELETE FROM public.templates WHERE delete_after IS NOT NULL AND delete_after <= now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$;

REVOKE ALL ON FUNCTION public.purge_expired_templates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_expired_templates() TO authenticated;

-- Run the purge daily if pg_cron is available. The app also calls the
-- function when the templates page loads, so deletion still happens without it.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'purge-expired-templates';
  PERFORM cron.schedule('purge-expired-templates', '17 3 * * *', 'SELECT public.purge_expired_templates()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available, skipping scheduled purge: %', SQLERRM;
END;
$$;
