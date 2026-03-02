import { X } from "lucide-react";
import { Input } from "../ui/input";
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from "../ui/form";
import { useWatch } from "react-hook-form";

export function ClassesInput({ form }) {
  const classes = useWatch({
    control: form.control,
    name: "classes",
  }) as string[] | undefined;

  const parseClasses = (input: string): string[] => {
    // Auto-detect delimiter: semicolon, comma, or pipe
    let delimiter = ",";
    if (input.includes(";")) {
      delimiter = ";";
    } else if (input.includes("|")) {
      delimiter = "|";
    }
    
    return input
      .split(delimiter)
      .map(c => c.trim())
      .filter(c => c.length > 0);
  };

  return (
    <FormField
      control={form.control}
      name="classes"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Classes / Labels</FormLabel>
          <FormControl>
            <Input
              placeholder="Enter labels separated by comma, pipe, or semicolon (e.g., diagnosis,treatment,prevention)"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const value = e.currentTarget.value.trim();
                  if (value) {
                    const newClasses = parseClasses(value);
                    // Merge with existing classes, avoiding duplicates
                    const existing = new Set(field.value ?? []);
                    newClasses.forEach(c => existing.add(c));
                    field.onChange(Array.from(existing));
                    e.currentTarget.value = "";
                  }
                }
              }}
            />
          </FormControl>
          <FormDescription className="text-xs text-muted-foreground">
            Separate labels with <code>,</code> <code>|</code> or <code>;</code> and press Enter
          </FormDescription>

          {/* chips */}
          <div className="mt-2 flex flex-wrap gap-2">
            {(classes ?? []).map((c, i) => (
              <span
                key={i}
                className="bg-secondary inline-flex items-center rounded-md px-2 py-1 text-sm"
              >
                {c}
                <button
                  type="button"
                  className="hover:text-destructive ml-1 cursor-pointer"
                  onClick={() => {
                    const next = [...(classes ?? [])];
                    next.splice(i, 1);
                    field.onChange(next);
                  }}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
