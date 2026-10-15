import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** Shows a short explanation when hovering or focusing the child. */
export function Hint({ text, children }: { text: string; children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        {/* span wrapper so disabled buttons still trigger the tooltip */}
        <TooltipTrigger asChild>
          <span className="inline-flex">{children}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-64 text-pretty">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
