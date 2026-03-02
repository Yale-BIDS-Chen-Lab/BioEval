import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ArrowDown, ArrowUp, Plus, X, Code2, ChevronDown, Trash2 } from "lucide-react";
import { useState } from "react";
import { CustomParsingDialog } from "./custom-parsing-dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { axios } from "@/lib/axios";
import { toast } from "sonner";

function buildDefaultArguments(def) {
  return def.parameters.map((p) => ({
    id: p.id,
    value: p.schema?.enum?.[0] ?? "", // Use first enum value as default, or empty string
  }));
}

function RenderField({
  arg,
  param,
  onChange,
}: {
  arg: any;
  param: any;
  onChange: (value: any) => void;
}) {
  const { schema } = param;

  // Handle enum (dropdown with specific options)
  if (schema.enum && Array.isArray(schema.enum)) {
    return (
      <Select
        value={arg.value ?? schema.enum[0]}
        onValueChange={(v) => onChange(v)}
      >
        <SelectTrigger>
          <SelectValue placeholder={param.name} />
        </SelectTrigger>
        <SelectContent>
          {schema.enum.map((option: string) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  switch (schema.type) {
    case "string":
      return (
        <Input
          value={arg.value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={param.name}
        />
      );
    case "number":
    case "integer":
      return (
        <Input
          type="number"
          value={arg.value ?? ""}
          onChange={(e) => onChange(Number(e.target.value))}
          placeholder={param.name}
        />
      );
    case "boolean":
      return (
        <Select
          value={String(arg.value)}
          onValueChange={(v) => onChange(v === "true")}
        >
          <SelectTrigger>
            <SelectValue placeholder={param.name} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">True</SelectItem>
            <SelectItem value="false">False</SelectItem>
          </SelectContent>
        </Select>
      );
    default:
      return (
        <Input
          value={JSON.stringify(arg.value) ?? ""}
          onChange={(e) => {
            try {
              onChange(JSON.parse(e.target.value));
            } catch (_) {
              onChange(e.target.value);
            }
          }}
          placeholder={param.name}
        />
      );
  }
}

export function SelectParsingFunctions({ form, parsingFunctions }) {
  const queryClient = useQueryClient();
  
  const deleteMutation = useMutation({
    mutationFn: (funcId: string) =>
      axios.delete("api/parsing/delete", {
        data: { funcId },
        withCredentials: true,
      }),
    onSuccess: () => {
      toast.success("Custom parsing function deleted");
      queryClient.invalidateQueries({ queryKey: ["create-eval-options"] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Failed to delete parsing function");
    },
  });

  return (
    <FormField
      control={form.control}
      name="parsingFunctions"
      render={({ field }) => {
        const selected = field.value ?? [];

        const commit = (next) =>
          form.setValue("parsingFunctions" as any, next, {
            shouldValidate: true,
          });

        const addFunction = (def) => {
          commit([
            ...selected,
            { id: def.taskId, arguments: buildDefaultArguments(def) },
          ]);
        };

        const move = (idx: number, dir: -1 | 1) => {
          const next = [...selected];
          const tgt = idx + dir;
          if (tgt < 0 || tgt >= next.length) return;
          [next[idx], next[tgt]] = [next[tgt], next[idx]];
          commit(next);
        };

        const remove = (idx: number) => {
          const next = [...selected];
          next.splice(idx, 1);
          commit(next);
        };

        const updateArg = (funcIdx: number, argIdx: number, value: any) => {
          const next = [...selected];
          next[funcIdx] = {
            ...next[funcIdx],
            arguments: next[funcIdx].arguments.map((a, i) =>
              i === argIdx ? { ...a, value } : a,
            ),
          };
          commit(next);
        };

        const [open, setOpen] = useState(false);

        return (
          <FormItem>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="mb-1 text-xl">Parsing Functions</p>
              </div>
              <div className="flex gap-2">
                <CustomParsingDialog onSuccess={() => setOpen(false)} />
                <Dialog open={open} onOpenChange={setOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="secondary">
                      <Plus className="mr-1 h-4 w-4" /> Add function
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-sm min-w-sm p-4">
                    <DialogHeader>
                      <DialogTitle>Select a function</DialogTitle>
                    </DialogHeader>
                    <ScrollArea className="h-72 pr-2">
                      <div className="flex flex-col gap-2">
                        {parsingFunctions.map((def) => (
                          <div key={def.taskId} className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              className="flex-1 justify-start"
                              onClick={() => {
                                addFunction(def);
                                setOpen(false);
                              }}
                            >
                              {def.name}
                            </Button>
                            {def.isCustom && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm(`Delete "${def.name}"?`)) {
                                    deleteMutation.mutate(def.taskId);
                                  }
                                }}
                                disabled={deleteMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              {selected.map((sel, idx) => {
                const def = parsingFunctions.find((d) => d.taskId === sel.id);
                if (!def) return null;
                return (
                  <div
                    key={idx}
                    className="rounded-md border p-4 transition-shadow hover:shadow-sm"
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <span className="font-medium">{def.name}</span>
                      <div className="flex items-center gap-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => move(idx, -1)}
                          disabled={idx === 0}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => move(idx, 1)}
                          disabled={idx === selected.length - 1}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => remove(idx)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {def.code && (
                      <Collapsible className="mb-4">
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full justify-between"
                          >
                            <span className="flex items-center gap-2">
                              <Code2 className="h-4 w-4" />
                              View Implementation
                            </span>
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-2">
                          <div className="max-h-96 overflow-y-auto rounded-md border">
                            <pre className="bg-slate-950 p-4 text-xs text-slate-50 overflow-x-auto m-0">
                              <code>{def.code}</code>
                            </pre>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    )}

                    <div className="grid gap-4 md:grid-cols-2">
                      {def.parameters.map((param, pIdx) => {
                        const arg = sel.arguments.find(
                          (a) => a.id === param.id,
                        )!;
                        return (
                          <div key={param.id} className="flex flex-col gap-2">
                            <FormLabel className="text-xs font-semibold">
                              {param.name}
                            </FormLabel>
                            <FormControl>
                              <RenderField
                                arg={arg}
                                param={param}
                                onChange={(v) => updateArg(idx, pIdx, v)}
                              />
                            </FormControl>
                            <FormMessage />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {selected.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  No parsing will be done.
                </p>
              )}
            </div>
          </FormItem>
        );
      }}
    ></FormField>
  );
}
