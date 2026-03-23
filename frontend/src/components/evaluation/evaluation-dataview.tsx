import { Check, Download, Loader2, X, SearchIcon, Plus, Filter } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { axios } from "@/lib/axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useMemo, useRef, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { Cell, DataTable } from "../dataview-table/table";

type EditNotePayload = {
  inferenceId: string;
  notes: { rowId: string; content: string }[];
};

type EditHumanScorePayload = {
  evaluationId: string;
  scores: { rowId: string; score: number | null }[];
};

export function NotesCell({
  row,
  inferenceId,
}: {
  row: any;
  inferenceId: string;
}) {
  const expanded = row.getIsSelected();
  const rowId = row.original.id;
  const [value, setValue] = useState(row.original.notes ?? "");
  const timer = useRef<NodeJS.Timeout | null>(null);

  const {
    mutate: saveNotes,
    isPending,
    isSuccess,
  } = useMutation({
    mutationFn: (payload: EditNotePayload) =>
      axios.post("api/inference/edit-note", payload, {
        withCredentials: true,
      }),
  });

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      saveNotes({
        inferenceId,
        notes: [{ rowId, content: value }],
      });
    }, 500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, rowId, saveNotes, inferenceId]);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  if (!expanded)
    return (
      <div className="w-full truncate font-mono text-xs" onClick={stop}>
        {value}
      </div>
    );

  return (
    <div
      className="relative w-full"
      onClick={stop}
      onMouseDown={stop}
      onFocus={(e) => {
        stop(e);
        row.toggleSelected(true);
      }}
    >
      <TextareaAutosize
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add comments..."
        minRows={1}
        className="w-full resize-none border-0 bg-transparent p-0 font-mono text-xs leading-5 shadow-none outline-none focus-visible:ring-0"
      />

      {isPending && (
        <Loader2 className="absolute top-1/2 right-1 h-3.5 w-3.5 -translate-y-1/2 animate-spin" />
      )}
      {!isPending && isSuccess && (
        <Check className="absolute top-1/2 right-1 h-3.5 w-3.5 -translate-y-1/2 text-green-500" />
      )}
    </div>
  );
}

export function HumanScoreCell({
  row,
  evaluationId,
}: {
  row: any;
  evaluationId: string;
}) {
  const expanded = row.getIsSelected();
  const rowId = row.original.id;
  const initialValue =
    typeof row.original.humanScore === "number"
      ? String(row.original.humanScore)
      : "unrated";
  const [value, setValue] = useState(initialValue);
  const queryClient = useQueryClient();

  useEffect(() => {
    setValue(
      typeof row.original.humanScore === "number"
        ? String(row.original.humanScore)
        : "unrated"
    );
  }, [row.original.humanScore]);

  const { mutate, isPending, isSuccess } = useMutation({
    mutationFn: (payload: EditHumanScorePayload) =>
      axios.post("api/evaluation/edit-human-score", payload, {
        withCredentials: true,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["evaluation-dataview", evaluationId],
      });
    },
  });

  const save = (nextValue: string) => {
    setValue(nextValue);
    mutate({
      evaluationId,
      scores: [
        {
          rowId,
          score: nextValue === "unrated" ? null : Number(nextValue),
        },
      ],
    });
  };

  if (!expanded) {
    return (
      <div className="w-24 font-mono text-xs">
        {value === "unrated" ? "—" : value}
      </div>
    );
  }

  return (
    <div
      className="relative w-28"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Select value={value} onValueChange={save} disabled={isPending}>
        <SelectTrigger className="h-8 w-24 font-mono text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unrated">—</SelectItem>
          {[1, 2, 3, 4, 5].map((score) => (
            <SelectItem key={score} value={String(score)}>
              {score}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isPending && (
        <Loader2 className="absolute top-1/2 right-1 h-3.5 w-3.5 -translate-y-1/2 animate-spin" />
      )}
      {!isPending && isSuccess && (
        <Check className="absolute top-1/2 right-1 h-3.5 w-3.5 -translate-y-1/2 text-green-500" />
      )}
    </div>
  );
}

type Highlight = { start: number; end: number } | undefined;

type EditHighlightPayload = {
  inferenceId: string;
  highlights: { rowId: string; start: number; end: number }[];
};

type DeleteHighlightPayload = {
  inferenceId: string;
  rowIds: string[];
};

export function OutputCell({
  row,
  inferenceId,
  initialHighlight,
  rowName
}: {
  row: any;
  inferenceId: string;
  initialHighlight?: Highlight;
  rowName: string;
}) {
  const expanded = row.getIsSelected();
  const rowId: string = row.original.id;
  const text: string = row.getValue(rowName) ?? "";

  const [hl, setHl] = useState<Highlight>(initialHighlight);
  useEffect(() => {
    setHl(initialHighlight);
  }, [initialHighlight?.start, initialHighlight?.end]);

  const ref = useRef<HTMLDivElement | null>(null);

  const {
    mutate: saveHighlight,
    isPending: isSaving,
    isSuccess: saved,
  } = useMutation({
    mutationFn: (payload: EditHighlightPayload) =>
      axios.post("/api/inference/edit-highlight", payload, {
        withCredentials: true,
      }),
  });

  const {
    mutate: deleteHighlight,
    isPending: isDeleting,
    isSuccess: deleted,
  } = useMutation({
    mutationFn: (payload: DeleteHighlightPayload) =>
      axios.post("/api/inference/delete-highlight", payload, {
        withCredentials: true,
      }),
  });

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const handleMouseUp = (e: React.MouseEvent) => {
    stop(e);
    const root = ref.current;
    const sel = window.getSelection();
    if (!root || !sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    if (
      !root.contains(range.startContainer) ||
      !root.contains(range.endContainer)
    )
      return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);

    const offsetOf = (node: Node, nodeOffset: number) => {
      let acc = 0;
      for (const n of nodes) {
        if (n === node) return acc + nodeOffset;
        acc += n.nodeValue?.length ?? 0;
      }
      return acc;
    };

    const a = offsetOf(range.startContainer, range.startOffset);
    const b = offsetOf(range.endContainer, range.endOffset);
    const start = Math.max(0, Math.min(a, b));
    const end = Math.min(text.length, Math.max(a, b));
    if (end <= start) return;

    const next = { start, end };
    setHl(next);
    saveHighlight({ inferenceId, highlights: [{ rowId, start, end }] });

    try {
      sel.removeAllRanges();
    } catch {}
  };

  const onDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    stop(e);
    setHl(undefined);
    deleteHighlight({ inferenceId, rowIds: [rowId] });
  };

  const renderHighlighted = (t: string, h?: Highlight) => {
    if (!h || h.start >= h.end || h.start >= t.length) return <span>{t}</span>;
    const s = Math.max(0, h.start);
    const e = Math.min(t.length, h.end);
    const pre = t.slice(0, s);
    const mid = t.slice(s, e);
    const post = t.slice(e);
    return (
      <>
        <span>{pre}</span>
        <span className="relative rounded bg-yellow-200/60 px-0.5 dark:bg-yellow-600/40">
          {mid}
          <button
            aria-label="Remove highlight"
            title="Remove highlight"
            onMouseDown={stop}
            onClick={onDelete}
            className="bg-foreground/90 text-background pointer-events-auto absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-md opacity-0 shadow group-hover/cell:opacity-100 focus:opacity-100"
          >
            <X className="pointer-events-none h-3 w-3" />
          </button>
        </span>
        <span>{post}</span>
      </>
    );
  };

  if (!expanded) {
    return (
      <div
        className="no-native-selection w-128 truncate font-mono text-xs"
        onMouseDown={stop}
        onClick={stop}
      >
        {renderHighlighted(text, hl)}
      </div>
    );
  }

  return (
    <div
      className="group/cell relative w-full"
      onMouseDown={stop}
      onClick={stop}
    >
      <div
        ref={ref}
        onMouseUp={handleMouseUp}
        className="no-native-selection font-mono text-xs leading-5 break-words whitespace-pre-wrap"
      >
        {renderHighlighted(text, hl)}
      </div>

      {(isSaving || isDeleting) && (
        <Loader2 className="absolute top-1/2 right-1 h-3.5 w-3.5 -translate-y-1/2 animate-spin" />
      )}
      {!isSaving && !isDeleting && (saved || deleted) && (
        <Check className="absolute top-1/2 right-1 h-3.5 w-3.5 -translate-y-1/2 text-green-500" />
      )}
    </div>
  );
}

type FilterCondition = {
  id: string;
  metric: string;
  operator: ">" | "<" | ">=" | "<=" | "=" | "!=";
  value: number;
};

export function DataView({
  data,
  inferenceId,
  evaluationId,
  taskId,
  evaluationMetrics = [],
}: {
  data: any[];
  inferenceId: string;
  evaluationId: string;
  taskId?: string;
  evaluationMetrics?: string[];
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterConditions, setFilterConditions] = useState<FilterCondition[]>([]);
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  const metricKeys = useMemo(() => {
    if (!data.length) return [] as string[];
    return data[0].metrics.map((m: any) => m.key);
  }, [data]);

  const ops: Record<string, (a: number, b: number) => boolean> = {
    ">": (a, b) => a > b,
    "<": (a, b) => a < b,
    ">=": (a, b) => a >= b,
    "<=": (a, b) => a <= b,
    "=": (a, b) => a === b,
    "!=": (a, b) => a !== b,
  };

  const filteredData = useMemo(() => {
    if (filterConditions.length === 0) return data;
    return data.filter((row) =>
      filterConditions.every((cond) => {
        const metric = row.metrics?.find((m: any) => m.key === cond.metric);
        const num = typeof metric?.value === "number" ? metric.value : parseFloat(metric?.value);
        if (isNaN(num)) return false;
        const fn = ops[cond.operator];
        return fn ? fn(num, cond.value) : false;
      }),
    );
  }, [data, filterConditions]);

  const addFilter = () => {
    setFilterConditions((prev) => [
      ...prev,
      { id: crypto.randomUUID(), metric: metricKeys[0] ?? "", operator: ">", value: 0 },
    ]);
    setShowFilterPanel(true);
  };

  const removeFilter = (id: string) => {
    setFilterConditions((prev) => prev.filter((c) => c.id !== id));
  };

  const updateFilter = (id: string, field: keyof FilterCondition, value: string | number) => {
    setFilterConditions((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
    );
  };

  const { data: highlights = {} } = useQuery({
    queryKey: ["inference-highlights", inferenceId],
    queryFn: async () => {
      const { data } = await axios.get("api/inference/highlights", {
        params: { inferenceId },
        withCredentials: true,
      });
      return data.highlights ?? {};
    },
  });

  const download = () => {
    const a = document.createElement("a");
    const file = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    a.href = URL.createObjectURL(file);
    a.download = "export.json";
    a.click();
  };

  const metricColumns = useMemo<ColumnDef<any>[]>(
    () =>
      metricKeys.map((key: string) => ({
        id: key,
        meta: { label: key },
        header: () => (
          <div className="text-foreground text-left font-mono text-xs font-bold">
            {key}
          </div>
        ),
        accessorFn: (row: any) =>
          row.metrics.find((m: any) => m.key === key)?.value ?? "",
        cell: ({ getValue }: { getValue: () => unknown }) => {
          const v = getValue();
          return (
            <div className="text-foreground w-32 font-mono text-xs">
              {typeof v === "number" ? v.toFixed(4) : ""}
            </div>
          );
        },
      })),
    [metricKeys],
  );

  const columns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        accessorKey: "id",
        meta: { label: "ID" },
        header: () => (
          <div className="text-foreground w-32 text-left font-mono text-xs font-bold">
            ID
          </div>
        ),
        cell: ({ row }) => (
          <Cell value={row.getValue("id")} expanded={row.getIsSelected()} />
        ),
      },
      {
        accessorKey: "input",
        meta: { label: "Input" },
        header: () => (
          <div className="text-foreground w-144 text-left font-mono text-xs font-bold">
            Input
          </div>
        ),
        cell: ({ row }) => (
          <Cell value={row.getValue("input")} expanded={row.getIsSelected()} />
        ),
      },
      {
        accessorKey: "reference",
        meta: { label: "Reference" },
        header: () => (
          <div className="text-foreground w-144 text-left font-mono text-xs font-bold">
            Reference
          </div>
        ),
        cell: ({ row }) => (
          <Cell
            value={row.getValue("reference")}
            expanded={row.getIsSelected()}
          />
        ),
      },
      {
        accessorKey: "output",
        meta: { label: "Output" },
        header: () => (
          <div className="text-foreground w-128 text-left font-mono text-xs font-bold">
            Output
          </div>
        ),
        cell: ({ row }) => (
          <OutputCell
            row={row}
            inferenceId={inferenceId}
            initialHighlight={highlights?.[row.original.id]}
            rowName="output"
          />
        ),
      },
      {
        accessorKey: "parsed",
        meta: { label: "Parsed Output" },
        header: () => (
          <div className="text-foreground w-128 text-left font-mono text-xs font-bold">
            Parsed Output
          </div>
        ),
        cell: ({ row }) => (
          <OutputCell
            row={row}
            inferenceId={inferenceId}
            initialHighlight={highlights?.[row.original.id]}
            rowName="parsed"
          />
        ),
      },
      ...(taskId === "mlc" ? [
        {
          accessorKey: "referenceVector",
          meta: { label: "Reference Vector" },
          header: () => (
            <div className="text-foreground w-128 text-left font-mono text-xs font-bold">
              Reference Vector
            </div>
          ),
          cell: ({ row }: { row: any }) => {
            const vector = row.getValue("referenceVector");
            if (!vector) return <Cell value="" expanded={row.getIsSelected()} />;
            // Convert to array of numbers and format without quotes
            const numArray = Array.isArray(vector)
              ? vector.map((value: unknown) => Number(value))
              : [];
            const formatted = `[${numArray.join(",")}]`;
            return (
              <Cell 
                value={formatted} 
                expanded={row.getIsSelected()} 
              />
            );
          },
        },
        {
          accessorKey: "parsedVector",
          meta: { label: "Parsed Output Vector" },
          header: () => (
            <div className="text-foreground w-128 text-left font-mono text-xs font-bold">
              Parsed Output Vector
            </div>
          ),
          cell: ({ row }: { row: any }) => {
            const vector = row.getValue("parsedVector");
            if (!vector) return <Cell value="" expanded={row.getIsSelected()} />;
            // Convert to array of numbers and format without quotes
            const numArray = Array.isArray(vector)
              ? vector.map((value: unknown) => Number(value))
              : [];
            const formatted = `[${numArray.join(",")}]`;
            return (
              <Cell 
                value={formatted} 
                expanded={row.getIsSelected()} 
              />
            );
          },
        },
      ] : []),
      ...metricColumns,
      ...(evaluationMetrics.includes("human_evaluation")
        ? [
            {
              id: "humanScore",
              meta: { label: "Human Evaluation" },
              header: () => (
                <div className="text-foreground w-28 text-left font-mono text-xs font-bold">
                  Human Evaluation
                </div>
              ),
              cell: ({ row }: { row: any }) => (
                <HumanScoreCell row={row} evaluationId={evaluationId} />
              ),
            } satisfies ColumnDef<any>,
          ]
        : []),
      {
        id: "notes",
        meta: { label: "Comments" },
        header: () => (
          <div className="text-foreground w-128 text-left font-mono text-xs font-bold">
            Comments
          </div>
        ),
        cell: ({ row }) => <NotesCell row={row} inferenceId={inferenceId} />,
      },
    ],
    [metricColumns, inferenceId, highlights, taskId, evaluationMetrics, evaluationId],
  );

  return (
    <>
      <div className="flex flex-col flex-shrink-0 border-b">
        <div className="flex h-14 w-full flex-row items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <SearchIcon className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-80 border-0 pl-10"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {metricKeys.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={addFilter}
              >
                <Filter className="h-4 w-4" />
                Filter by metrics
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="cursor-pointer"
              onClick={download}
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {(filterConditions.length > 0 || showFilterPanel) && (
          <div className="border-t bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold">Conditions (all must match):</span>
              <Button variant="ghost" size="sm" onClick={addFilter} className="h-7 gap-1">
                <Plus className="h-3 w-3" />
                Add
              </Button>
            </div>
            <div className="space-y-2">
              {filterConditions.map((cond) => (
                <div
                  key={cond.id}
                  className="flex flex-wrap items-center gap-2 rounded-md bg-background border px-3 py-2"
                >
                  <Select
                    value={cond.metric}
                    onValueChange={(v) => updateFilter(cond.id, "metric", v)}
                  >
                    <SelectTrigger className="h-8 w-[160px]">
                      <SelectValue placeholder="Metric" />
                    </SelectTrigger>
                    <SelectContent>
                      {metricKeys.map((metricKey: string) => (
                        <SelectItem key={metricKey} value={metricKey}>
                          {metricKey}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={cond.operator}
                    onValueChange={(v) =>
                      updateFilter(cond.id, "operator", v as FilterCondition["operator"])
                    }
                  >
                    <SelectTrigger className="h-8 w-[70px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value=">">&gt;</SelectItem>
                      <SelectItem value="<">&lt;</SelectItem>
                      <SelectItem value=">=">&gt;=</SelectItem>
                      <SelectItem value="<=">&lt;=</SelectItem>
                      <SelectItem value="=">=</SelectItem>
                      <SelectItem value="!=">≠</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    step="any"
                    className="h-8 w-24 font-mono"
                    value={cond.value}
                    onChange={(e) =>
                      updateFilter(cond.id, "value", parseFloat(e.target.value) || 0)
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removeFilter(cond.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            {filterConditions.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Showing {filteredData.length} of {data.length} rows
              </p>
            )}
          </div>
        )}
      </div>

      <DataTable
        data={filteredData}
        columns={columns}
        globalFilter={searchQuery}
        onGlobalFilterChange={setSearchQuery}
      />
    </>
  );
}
