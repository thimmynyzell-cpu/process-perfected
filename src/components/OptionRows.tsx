import { useEffect, useRef, useState, type ReactNode } from "react";
import { Circle, Lightbulb, Plus, Trash2, X } from "lucide-react";
import { useT } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { takeTip, turnOffTips } from "@/lib/tips";

// One row per checkbox or dropdown option, stored as newline-separated
// options like before. Empty rows are dropped on save (see optList).
export function OptionRows({
  kind,
  value,
  onChange,
  onRename,
  extra,
}: {
  kind: "checkbox" | "dropdown";
  value: string;
  onChange: (value: string) => void;
  /** Called with trimmed old and new text when a row's text changes. */
  onRename?: (from: string, to: string) => void;
  /** Rendered at the end of each row, e.g. a jump target picker. */
  extra?: (option: string) => ReactNode;
}) {
  const t = useT();
  // Rows live in local state: a single empty row and no rows both join to "",
  // so they can't be derived from `value` alone.
  const [rows, setRows] = useState(() => split(value));
  useEffect(() => {
    if (value !== rows.join("\n")) setRows(split(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusRow, setFocusRow] = useState<number | null>(null);

  useEffect(() => {
    if (focusRow !== null) {
      inputs.current[focusRow]?.focus();
      setFocusRow(null);
    }
  }, [focusRow]);

  // Index of the occasional tip shown above the rows, if any.
  const [tip, setTip] = useState<number | null>(null);
  useEffect(() => {
    if (tip === null) return;
    const timer = setTimeout(() => setTip(null), 12000);
    return () => clearTimeout(timer);
  }, [tip]);

  const set = (next: string[]) => {
    setRows(next);
    onChange(next.join("\n"));
  };
  const add = (at: number) => {
    set([...rows.slice(0, at), "", ...rows.slice(at)]);
    setFocusRow(at);
  };

  return (
    <div className="relative space-y-2 @sm:col-span-2 @2xl:col-span-3">
      {tip !== null && (
        <div
          role="status"
          className="absolute bottom-full left-6 z-20 mb-2 w-80 max-w-[calc(100%-1.5rem)] rounded-lg border border-primary/30 bg-card p-3 text-sm shadow-lg animate-in fade-in-0 slide-in-from-bottom-1"
        >
          <div className="flex items-start gap-2">
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="flex-1">{t(`templates.tip${tip}`)}</p>
            <button
              type="button"
              tabIndex={-1}
              aria-label={t("common.close")}
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setTip(null)}
            >
              <X className="size-4" />
            </button>
          </div>
          <button
            type="button"
            tabIndex={-1}
            className="mt-1 pl-6 text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => {
              turnOffTips();
              setTip(null);
            }}
          >
            {t("templates.tipOff")}
          </button>
          <span className="absolute -bottom-1.5 left-4 size-3 rotate-45 border-b border-r border-primary/30 bg-card" />
        </div>
      )}
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          {kind === "checkbox" ? (
            <Checkbox disabled aria-hidden className="shrink-0" />
          ) : (
            <Circle aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          )}
          <Input
            ref={(el) => {
              inputs.current[i] = el;
            }}
            placeholder={t(
              kind === "checkbox" ? "templates.checkboxPlaceholder" : "templates.optionPlaceholder",
            )}
            value={row}
            onFocus={() => {
              if (tip === null) {
                const next = takeTip();
                if (next !== null) setTip(next);
              }
            }}
            onChange={(e) => {
              set(rows.map((r, j) => (j === i ? e.target.value : r)));
              onRename?.(row.trim(), e.target.value.trim());
            }}
            onKeyDown={(e) => {
              // The tip has done its job once the shortcut is used.
              if (e.key === "Tab" || e.key === "Enter") setTip(null);
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
          {extra?.(row.trim())}
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
          <Plus className="size-4" />{" "}
          {t(kind === "checkbox" ? "templates.addCheckbox" : "templates.addOption")}
        </Button>
        {kind === "checkbox" && rows.length === 0 && (
          <span className="text-xs text-muted-foreground">{t("templates.checkboxHint")}</span>
        )}
      </div>
    </div>
  );
}

const split = (value: string) => (value === "" ? [] : value.split("\n"));
