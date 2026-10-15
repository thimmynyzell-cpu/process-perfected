import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useT } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

// One row per checkbox, stored as newline-separated options like before.
// Empty rows are dropped on save (see optList).
export function CheckboxOptions({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useT();
  const rows = value === "" ? [] : value.split("\n");
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusRow, setFocusRow] = useState<number | null>(null);

  useEffect(() => {
    if (focusRow !== null) {
      inputs.current[focusRow]?.focus();
      setFocusRow(null);
    }
  }, [focusRow]);

  const set = (next: string[]) => onChange(next.join("\n"));
  const add = (at: number) => {
    set([...rows.slice(0, at), "", ...rows.slice(at)]);
    setFocusRow(at);
  };

  return (
    <div className="space-y-2 md:col-span-3">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <Checkbox disabled aria-hidden className="shrink-0" />
          <Input
            ref={(el) => {
              inputs.current[i] = el;
            }}
            placeholder={t("templates.checkboxPlaceholder")}
            value={row}
            onChange={(e) => set(rows.map((r, j) => (j === i ? e.target.value : r)))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(i + 1);
              }
              // Tab from a filled-in last row creates the next row; from an
              // empty last row it moves on as usual.
              if (e.key === "Tab" && !e.shiftKey && i === rows.length - 1 && row.trim() !== "") {
                e.preventDefault();
                add(i + 1);
              }
            }}
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            tabIndex={-1}
            aria-label={t("common.delete")}
            onClick={() => set(rows.filter((_, j) => j !== i))}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" variant="outline" onClick={() => add(rows.length)}>
          <Plus className="size-4" /> {t("templates.addCheckbox")}
        </Button>
        {rows.length === 0 && (
          <span className="text-xs text-muted-foreground">{t("templates.checkboxHint")}</span>
        )}
      </div>
    </div>
  );
}
