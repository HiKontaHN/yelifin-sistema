// components/shared/info-tooltip.tsx
"use client";

import { Info } from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Props = {
  content: React.ReactNode;
  className?: string;
  /** Lado donde aparece el tooltip (default: top) */
  side?: "top" | "bottom" | "left" | "right";
};

/**
 * Icono de info con tooltip explicativo al hacer hover.
 * Pensado para acompañar labels de métricas que necesitan contexto.
 */
export function InfoTooltip({ content, className, side = "top" }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="Más información"
          className={cn(
            "inline-flex shrink-0 text-muted-foreground/70 hover:text-foreground transition-colors cursor-help",
            className
          )}
        >
          <Info className="size-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-64 text-left">
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
