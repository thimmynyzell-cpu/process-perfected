/** Sections every checklist offers; INTRO comes first and AVSLUT last. */
export const INTRO = "INTRO";
export const OUTRO = "AVSLUT";

/** Section names in order: INTRO, then the others as they first appear, then AVSLUT. */
export function sectionOrder(names: (string | null | undefined)[], withDefaults = false): string[] {
  const seen = [...new Set(names.map((n) => (n ?? "").trim()).filter(Boolean))];
  if (withDefaults) {
    if (!seen.includes(INTRO)) seen.push(INTRO);
    if (!seen.includes(OUTRO)) seen.push(OUTRO);
  }
  const middle = seen.filter((n) => n !== INTRO && n !== OUTRO);
  return [...(seen.includes(INTRO) ? [INTRO] : []), ...middle, ...(seen.includes(OUTRO) ? [OUTRO] : [])];
}
