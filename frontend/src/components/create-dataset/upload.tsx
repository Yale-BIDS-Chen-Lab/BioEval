import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ingestFile, initDb, type DuckBundle } from "@/lib/duckdb";
import type { ColumnDef } from "@tanstack/react-table";
import { File as FileIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Cell, DataTable } from "../dataview-table/table";
import { Button } from "../ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

const REQUIRED_COLUMNS = ["id", "input_raw", "reference"] as const;

function UploadPrompt({ fileInput, onFile }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
      <input
        ref={fileInput}
        type="file"
        accept=".csv,.json,.xlsx"
        className="hidden"
        onChange={onFile}
      />

      <Tooltip>
        <TooltipTrigger
          type="button"
          onClick={() => fileInput.current?.click()}
        >
          <div className="hover:bg-input/30 flex w-128 cursor-pointer flex-col items-center justify-center gap-4 rounded-md border border-dashed p-8 transition select-none">
            <div>
              <FileIcon className="size-8" />
            </div>
            <p>Click to upload</p>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>.csv, .json, .xlsx</p>
        </TooltipContent>
      </Tooltip>

      <div className="text-muted-foreground max-w-md text-center text-xs leading-relaxed">
        <p>
          Accepted formats: <span className="font-medium">.csv</span>,{" "}
          <span className="font-medium">.json</span>,{" "}
          <span className="font-medium">.xlsx</span>
        </p>
        <p className="mt-1">
          Requires at least 3 columns (ID, input_raw, and reference).
          Column names don't need to match — you'll map them in the next step.
        </p>
      </div>
    </div>
  );
}

function ColumnMapper({ sourceColumns, onConfirm, onCancel }) {
  const [mapping, setMapping] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    REQUIRED_COLUMNS.forEach((req, i) => {
      if (i < sourceColumns.length) {
        initial[req] = sourceColumns[i];
      }
    });
    return initial;
  });

  const allMapped = REQUIRED_COLUMNS.every((k) => mapping[k]);

  const handleChange = (req: string, val: string) => {
    setMapping((prev) => {
      const next = { ...prev };
      // If another field already uses this column, swap them
      const conflictKey = Object.keys(next).find(
        (k) => k !== req && next[k] === val,
      );
      if (conflictKey) {
        next[conflictKey] = prev[req];
      }
      next[req] = val;
      return next;
    });
  };

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6">
      <div className="text-center">
        <p className="text-sm font-medium">Map your columns</p>
        <p className="text-muted-foreground mt-1 text-xs">
          Select which column in your file corresponds to each required field.
        </p>
      </div>

      <div className="grid grid-cols-[auto_auto_auto] items-center gap-x-4 gap-y-3">
        <span className="text-muted-foreground text-xs font-medium">Required</span>
        <span />
        <span className="text-muted-foreground text-xs font-medium">Your column</span>

        {REQUIRED_COLUMNS.map((req) => (
          <>
            <code key={`label-${req}`} className="bg-muted rounded px-2 py-1 text-xs">
              {req}
            </code>
            <span key={`arrow-${req}`} className="text-muted-foreground text-xs">→</span>
            <Select
              key={`select-${req}`}
              value={mapping[req] ?? ""}
              onValueChange={(val) => handleChange(req, val)}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select column" />
              </SelectTrigger>
              <SelectContent>
                {sourceColumns.map((col) => (
                  <SelectItem key={col} value={col}>
                    {col}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        ))}
      </div>

      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!allMapped}
          onClick={() => onConfirm(mapping)}
        >
          Confirm
        </Button>
      </div>
    </div>
  );
}

function formatBytes(bytes, decimals = 2) {
  if (!+bytes) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = [
    "Bytes",
    "KiB",
    "MiB",
    "GiB",
    "TiB",
    "PiB",
    "EiB",
    "ZiB",
    "YiB",
  ];

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function Banner({ fileMeta }) {
  return (
    <div className="flex items-center gap-6 border-b px-4 py-2 font-mono text-xs">
      <span className="font-semibold">Previewing:</span>
      <span>{fileMeta.name}</span>
      <span>{formatBytes(fileMeta.size)}</span>
      <span>{fileMeta.rowCount.toLocaleString()} rows</span>
    </div>
  );
}

export function exportAsJson(rows: any[]) {
  // Convert BigInt values to strings for JSON serialization
  const jsonStr = JSON.stringify(
    rows,
    (key, value) => {
      if (typeof value === "bigint") {
        return value.toString();
      }
      return value;
    },
    2
  );
  return new File([jsonStr], "dataset.json", {
    type: "application/json",
  });
}

function applyMapping(
  rawRows: any[],
  mapping: Record<string, string>,
): any[] {
  return rawRows.map((row) => ({
    id: row[mapping.id],
    input_raw: row[mapping.input_raw],
    reference: row[mapping.reference],
  }));
}

export function UploadContainer({ form }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [duck, setDuck] = useState<DuckBundle>();
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [sourceColumns, setSourceColumns] = useState<string[]>([]);
  const [fileMeta, setFileMeta] = useState<any>();
  const [step, setStep] = useState<"upload" | "mapping" | "preview">("upload");

  useEffect(() => {
    initDb().then(setDuck).catch(console.error);
  }, []);

  const onFile = useCallback(
    async (ev: React.ChangeEvent<HTMLInputElement>) => {
      if (!duck || !ev.target.files?.length) return;

      const file = ev.target.files[0];
      try {
        const data = await ingestFile(duck, file);
        if (data.length === 0) {
          toast.error("Cannot upload empty dataset");
          return;
        }

        const cols = Object.keys(data[0]);
        setRawRows(data);
        setSourceColumns(cols);
        setFileMeta({
          name: file.name,
          size: file.size,
          rowCount: data.length,
        });

        setStep("mapping");
      } catch (e: any) {
        toast.error(e.message ?? "Import failed");
      }
    },
    [duck],
  );

  const onMappingConfirm = useCallback(
    (mapping: Record<string, string>) => {
      const mapped = applyMapping(rawRows, mapping);
      setRows(mapped);
      setStep("preview");

      const jsonFile = exportAsJson(mapped);
      form.setValue("datasetFile", jsonFile, {
        shouldValidate: true,
        isDirty: true,
      });
    },
    [rawRows, form],
  );

  const onMappingCancel = useCallback(() => {
    setRawRows([]);
    setSourceColumns([]);
    setFileMeta(undefined);
    setStep("upload");
    if (fileInput.current) fileInput.current.value = "";
  }, []);

  const columns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        accessorKey: "id",
        header: () => (
          <div className="text-foreground w-32 text-left font-mono text-xs font-bold">
            id
          </div>
        ),
        cell: ({ row }) => (
          <Cell value={row.getValue("id")} expanded={row.getIsSelected()} />
        ),
      },
      {
        accessorKey: "input_raw",
        header: () => (
          <div className="text-foreground w-144 text-left font-mono text-xs font-bold">
            input_raw
          </div>
        ),
        cell: ({ row }) => (
          <Cell
            value={row.getValue("input_raw")}
            expanded={row.getIsSelected()}
          />
        ),
      },
      {
        accessorKey: "reference",
        header: () => (
          <div className="text-foreground w-128 text-left font-mono text-xs font-bold">
            reference
          </div>
        ),
        cell: ({ row }) => (
          <Cell
            value={row.getValue("reference")}
            expanded={row.getIsSelected()}
          />
        ),
      },
    ],
    [],
  );

  return (
    <>
      {step === "preview" ? (
        <div className="flex h-full w-full flex-col">
          <Banner fileMeta={fileMeta} />
          <DataTable data={rows} columns={columns} />
        </div>
      ) : step === "mapping" ? (
        <ColumnMapper
          sourceColumns={sourceColumns}
          onConfirm={onMappingConfirm}
          onCancel={onMappingCancel}
        />
      ) : (
        <UploadPrompt fileInput={fileInput} onFile={onFile} />
      )}
    </>
  );
}
