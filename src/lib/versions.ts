import { supabase } from "@/integrations/supabase/client";

/**
 * Id of the template's current version. Reads the version recorded on the
 * template rather than the highest one, so a version left behind by a failed
 * save is ignored. Falls back to the highest version if needed.
 */
export async function currentVersionId(templateId: string, currentVersion: number): Promise<string | null> {
  const { data: exact } = await supabase
    .from("template_versions")
    .select("id")
    .eq("template_id", templateId)
    .eq("version", currentVersion)
    .maybeSingle();
  if (exact) return exact.id;
  const { data: latest } = await supabase
    .from("template_versions")
    .select("id")
    .eq("template_id", templateId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return latest?.id ?? null;
}

/** Next free version number, past any version left behind by a failed save. */
export async function nextVersionNumber(templateId: string, currentVersion: number): Promise<number> {
  const { data } = await supabase
    .from("template_versions")
    .select("version")
    .eq("template_id", templateId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return Math.max(currentVersion, data?.version ?? 0) + 1;
}
