import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

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

/** Columns newer than the first schema; a database without their migration rejects them. */
const OPTIONAL_COLUMNS = ["jump_to", "levels", "item_key", "base_key"];

type ItemInsert = Database["public"]["Tables"]["template_items"]["Insert"];

/**
 * Saves `rows` as a new version of a template and points the template at it.
 * Checks that every row landed and that the template was updated, since row
 * level security can drop writes without an error; on any failure the new
 * version is removed again. Returns the columns dropped for an older database.
 */
export async function writeVersion(opts: {
  templateId: string;
  orgId: string;
  userId: string;
  currentVersion: number;
  rows: Omit<ItemInsert, "version_id" | "org_id">[];
  patch?: Database["public"]["Tables"]["templates"]["Update"];
  messages: { itemsMissing: (saved: number, total: number) => string; notApplied: string };
}): Promise<{ version: number; dropped: string[] }> {
  const version = await nextVersionNumber(opts.templateId, opts.currentVersion);
  const { data: ver, error } = await supabase
    .from("template_versions")
    .insert({ template_id: opts.templateId, org_id: opts.orgId, version, created_by: opts.userId })
    .select()
    .single();
  if (error) throw error;
  const dropped: string[] = [];
  try {
    if (opts.rows.length) {
      let payload: Record<string, unknown>[] = opts.rows.map((r) => ({ ...r, version_id: ver.id, org_id: opts.orgId }));
      let e2 = null;
      for (let attempt = 0; attempt <= OPTIONAL_COLUMNS.length; attempt++) {
        ({ error: e2 } = await supabase.from("template_items").insert(payload as ItemInsert[]));
        const col = e2 && OPTIONAL_COLUMNS.find((c) => !dropped.includes(c) && e2!.message.includes(c));
        if (!col) break;
        payload = payload.map(({ [col]: _drop, ...rest }) => rest);
        dropped.push(col);
      }
      if (e2) throw e2;
      const { count } = await supabase
        .from("template_items")
        .select("id", { count: "exact", head: true })
        .eq("version_id", ver.id);
      if (count !== opts.rows.length) throw new Error(opts.messages.itemsMissing(count ?? 0, opts.rows.length));
    }
    const { data: updated, error: e3 } = await supabase
      .from("templates")
      .update({ ...opts.patch, current_version: version, updated_at: new Date().toISOString() })
      .eq("id", opts.templateId)
      .select("id");
    if (e3) throw e3;
    if (!updated?.length) throw new Error(opts.messages.notApplied);
  } catch (err) {
    await supabase.from("template_versions").delete().eq("id", ver.id);
    throw err;
  }
  return { version, dropped };
}
