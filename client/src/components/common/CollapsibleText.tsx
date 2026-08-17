import { useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { shouldCollapseText } from "./collapsibleTextState";

const collapsedLineClasses = {
  3: "line-clamp-3",
  4: "line-clamp-4",
  5: "line-clamp-5",
  6: "line-clamp-6",
} as const;

interface CollapsibleTextProps {
  text: string;
  collapsedLines?: keyof typeof collapsedLineClasses;
  characterThreshold?: number;
  className?: string;
  expandLabel?: string;
  collapseLabel?: string;
}

export function CollapsibleText({
  text,
  collapsedLines = 5,
  characterThreshold,
  className,
  expandLabel = "展开完整日志",
  collapseLabel = "收起日志",
}: CollapsibleTextProps) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const collapsible = shouldCollapseText(text, characterThreshold);

  useEffect(() => {
    setExpanded(false);
  }, [text]);

  return (
    <div className={cn("min-w-0", className)}>
      {collapsible ? (
        <button
          type="button"
          className="mb-2 inline-flex items-center gap-1 rounded-sm text-xs font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? collapseLabel : expandLabel}
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform duration-200", expanded && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      ) : null}
      <div
        id={contentId}
        className={cn(
          "whitespace-pre-wrap break-words [overflow-wrap:anywhere]",
          collapsible && !expanded && collapsedLineClasses[collapsedLines],
        )}
      >
        {text}
      </div>
    </div>
  );
}
