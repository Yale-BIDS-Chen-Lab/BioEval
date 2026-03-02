import type { ColumnDef } from "@tanstack/react-table";
import { SearchIcon, Plus, X, Filter } from "lucide-react";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Cell, DataTable } from "../dataview-table/table";

export type FilterCondition = {
  id: string;
  model: string;
  metric: string;
  operator: ">" | "<" | ">=" | "<=" | "=" | "!=";
  value: number;
};

export function DataView({
  data,
  commonMetrics = [],
  modelNames = [],
}: {
  data: any[];
  commonMetrics?: string[];
  modelNames?: string[];
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [filterConditions, setFilterConditions] = useState<FilterCondition[]>([]);
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  // Helper function to format metric names for display
  const formatMetricName = (metric: string): string => {
    // Convert metric keys like "rouge1" to "ROUGE-1", "bertscore" to "BERTScore", etc.
    const upperMetric = metric.toUpperCase();
    
    // Handle ROUGE metrics
    if (upperMetric.startsWith('ROUGE')) {
      const num = metric.replace(/[^0-9]/g, '');
      if (num) {
        return `ROUGE-${num}`;
      }
      return upperMetric;
    }
    
    // Handle specific known metrics
    const metricMap: Record<string, string> = {
      'bertscore': 'BERTScore',
      'bleu': 'BLEU',
      'meteor': 'METEOR',
      'accuracy': 'Accuracy',
      'f1': 'F1',
      'precision': 'Precision',
      'recall': 'Recall',
    };
    
    return metricMap[metric.toLowerCase()] || metric;
  };

  // Apply filter conditions to data
  const filteredData = useMemo(() => {
    if (filterConditions.length === 0) return data;

    const ops: Record<string, (a: number, b: number) => boolean> = {
      ">": (a, b) => a > b,
      "<": (a, b) => a < b,
      ">=": (a, b) => a >= b,
      "<=": (a, b) => a <= b,
      "=": (a, b) => a === b,
      "!=": (a, b) => a !== b,
    };

    return data.filter((row) => {
      return filterConditions.every((cond) => {
        const key = `${cond.model}:${cond.metric}`;
        const raw = row[key];
        const num = typeof raw === "number" ? raw : parseFloat(raw);
        if (isNaN(num)) return false;
        const fn = ops[cond.operator];
        return fn ? fn(num, cond.value) : false;
      });
    });
  }, [data, filterConditions]);

  const addFilterCondition = () => {
    const model = modelNames[0] ?? "";
    const metric = commonMetrics[0] ?? "";
    setFilterConditions((prev) => [
      ...prev,
      { id: crypto.randomUUID(), model, metric, operator: ">", value: 0 },
    ]);
    setShowFilterPanel(true);
  };

  const removeFilterCondition = (id: string) => {
    setFilterConditions((prev) => prev.filter((c) => c.id !== id));
  };

  const updateFilterCondition = (
    id: string,
    field: keyof FilterCondition,
    value: string | number
  ) => {
    setFilterConditions((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    );
  };

  const outputKeys = useMemo(() => {
    if (filteredData.length === 0) return [] as string[];

    const re = /(Output|Parsed)(?:\:\d+)?$/;
    return Object.keys(filteredData[0]).filter((k) => re.test(k));
  }, [filteredData]);

  // Get metric columns based on selected metrics
  const metricKeys = useMemo(() => {
    if (filteredData.length === 0 || selectedMetrics.length === 0) return [] as string[];
    
    const allKeys = Object.keys(filteredData[0]);
    return allKeys.filter((key) => {
      // Match pattern: {modelName}:{metricName}
      return selectedMetrics.some((metric) => key.endsWith(`:${metric}`));
    });
  }, [filteredData, selectedMetrics]);

  const headerLabels = useMemo(() => {
    const total: Record<string, number> = {};
    const seen: Record<string, number> = {};
    const labels: Record<string, string> = {};

    outputKeys.forEach((key) => {
      const canonical = key.replace(/:\d+$/, "");
      total[canonical] = (total[canonical] ?? 0) + 1;
    });

    outputKeys.forEach((key) => {
      const canonical = key.replace(/:\d+$/, "");
      const baseLabel = canonical
        .replace(/Output$/, " Output")
        .replace(/Parsed$/, " Parsed")
        .replace(/:\d+$/, "");

      seen[canonical] = (seen[canonical] ?? 0) + 1;
      const idx = seen[canonical];

      labels[key] = total[canonical] > 1 ? `${baseLabel} (${idx})` : baseLabel;
    });

    return labels;
  }, [outputKeys]);

  const outputColumns = useMemo<ColumnDef<any>[]>(
    () =>
      outputKeys.map((key) => ({
        id: key,
        accessorFn: (row) => row[key] as string,
        meta: { label: headerLabels[key] },
        header: () => (
          <div className="text-foreground w-64 text-left font-mono text-xs font-bold">
            {headerLabels[key]}
          </div>
        ),
        cell: ({ row }) => (
          <Cell value={row.getValue(key)} expanded={row.getIsSelected()} />
        ),
      })),
    [outputKeys, headerLabels],
  );

  const metricColumns = useMemo<ColumnDef<any>[]>(
    () =>
      metricKeys.map((key) => {
        // Extract model name and metric name from key like "gpt-4:rouge1"
        const match = key.match(/^(.+):(.+)$/);
        const modelName = match?.[1] || key;
        const rawMetricName = match?.[2] || key;
        const metricName = formatMetricName(rawMetricName);
        
        return {
          id: key,
          accessorFn: (row) => row[key],
          size: 160,
          maxSize: 160,
          meta: { label: `${modelName} (${metricName})` },
          header: () => (
            <div className="text-foreground min-w-0 text-left font-mono text-xs font-bold">
              <span className="block truncate" title={modelName}>
                {modelName}
              </span>
              <span className="text-muted-foreground block truncate font-normal" title={metricName}>
                {metricName}
              </span>
            </div>
          ),
          cell: ({ row }) => {
            const value = row.getValue(key);
            const numValue = typeof value === 'number' ? value : parseFloat(value);
            return (
              <div className="text-foreground min-w-0 font-mono text-xs">
                {!isNaN(numValue) ? numValue.toFixed(4) : '—'}
              </div>
            );
          },
        };
      }),
    [metricKeys],
  );

  const columns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        accessorKey: "id",
        meta: { label: "ID" },
        header: () => (
          <div className="text-foreground w-24 text-left font-mono text-xs font-bold">
            ID
          </div>
        ),
        cell: ({ row }) => (
          <div className="text-foreground w-24 truncate font-mono text-xs">
            {row.getValue("id")}
          </div>
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
          <div className="text-foreground w-64 text-left font-mono text-xs font-bold">
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
      ...outputColumns,
      ...metricColumns,
    ],
    [outputColumns, metricColumns],
  );

  return (
    <>
      <div className="flex flex-col flex-shrink-0 border-b">
        <div className="flex h-14 w-full flex-row items-center justify-between px-4">
          <div className="relative">
            <SearchIcon className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-80 border-0 pl-10"
            />
          </div>

          {commonMetrics.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Show metrics:</span>
              <div className="flex gap-2 flex-wrap">
                {commonMetrics.map((metric) => (
                  <button
                    key={metric}
                    onClick={() => {
                      setSelectedMetrics((prev) =>
                        prev.includes(metric)
                          ? prev.filter((m) => m !== metric)
                          : [...prev, metric]
                      );
                    }}
                    className={`rounded px-2 py-1 text-xs font-mono transition-colors ${
                      selectedMetrics.includes(metric)
                        ? "bg-primary text-primary-foreground"
                        : "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700"
                    }`}
                  >
                    {formatMetricName(metric)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {commonMetrics.length > 0 && modelNames.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={addFilterCondition}
            >
              <Filter className="h-4 w-4" />
              Filter by metrics
            </Button>
          )}
        </div>

        {/* Filter conditions panel */}
        {(filterConditions.length > 0 || showFilterPanel) && (
          <div className="border-t bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold">Conditions (all must match):</span>
              <Button variant="ghost" size="sm" onClick={addFilterCondition} className="h-7 gap-1">
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
                    value={cond.model}
                    onValueChange={(v) => updateFilterCondition(cond.id, "model", v)}
                  >
                    <SelectTrigger className="h-8 w-[180px]">
                      <SelectValue placeholder="Model" />
                    </SelectTrigger>
                    <SelectContent>
                      {modelNames.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={cond.metric}
                    onValueChange={(v) => updateFilterCondition(cond.id, "metric", v)}
                  >
                    <SelectTrigger className="h-8 w-[120px]">
                      <SelectValue placeholder="Metric" />
                    </SelectTrigger>
                    <SelectContent>
                      {commonMetrics.map((m) => (
                        <SelectItem key={m} value={m}>
                          {formatMetricName(m)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={cond.operator}
                    onValueChange={(v) =>
                      updateFilterCondition(cond.id, "operator", v as FilterCondition["operator"])
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
                      updateFilterCondition(cond.id, "value", parseFloat(e.target.value) || 0)
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removeFilterCondition(cond.id)}
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

        {filterConditions.length === 0 && data.length > 0 && (
          <div className="px-4 py-1 text-xs text-muted-foreground border-t">
            {data.length} rows
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
