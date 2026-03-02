import { ChevronRight } from "lucide-react";
import { useState } from "react";
import {
  CollapsibleContent,
  CollapsibleTrigger,
  Collapsible as ShadcnCollapsible,
} from "../ui/collapsible";

function Collapsible({
  title,
  children,
}: React.ComponentProps<"div"> & { title: string }) {
  const [open, setOpen] = useState(false);

  return (
    <ShadcnCollapsible>
      <CollapsibleTrigger onClick={() => setOpen(!open)}>
        <div
          className={`${open ? "text-muted-foreground" : "text-muted-foreground/75"} hover:text-muted-foreground mb-2 flex cursor-pointer flex-row items-center gap-1.5 transition`}
        >
          <span className="text-sm">{title}</span>
          <ChevronRight
            size={16}
            className={`${open ? "rotate-90" : ""} transform transition`}
          />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </ShadcnCollapsible>
  );
}

export { Collapsible };
