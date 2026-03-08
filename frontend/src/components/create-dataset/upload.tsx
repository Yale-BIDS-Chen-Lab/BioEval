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
      {/* <div className="flex flex-col items-center justify-center">
        <Button
          type="button"
          className="w-128 cursor-pointer"
          variant="outline"
        >
          <img src="/logos/huggingface.svg" className="size-8" />
          <span>Import from Huggingface</span>
        </Button>
      </div>

      <p>OR</p> */}

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
          File must contain three columns:{" "}
          <code className="bg-muted rounded px-1 py-0.5">id</code>,{" "}
          <code className="bg-muted rounded px-1 py-0.5">input_raw</code>,{" "}
          <code className="bg-muted rounded px-1 py-0.5">reference</code>
        </p>
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
  const hiddenColumns = 3 - fileMeta.colCount.toLocaleString();

  return (
    <div className="flex items-center gap-6 border-b px-4 py-2 font-mono text-xs">
      <span className="font-semibold">Previewing:</span>
      <span>{fileMeta.name}</span>
      <span>{formatBytes(fileMeta.size)}</span>
      <span>{fileMeta.rowCount.toLocaleString()} rows</span>
      {hiddenColumns > 0 && <span>ignoring {hiddenColumns} extra columns</span>}
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

export function UploadContainer({ form }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [duck, setDuck] = useState<DuckBundle>();
  const [rows, setRows] = useState<any[]>([]);
  const [fileMeta, setFileMeta] = useState();

  useEffect(() => {
    initDb().then(setDuck).catch(console.error);
  }, []);

  const onFile = useCallback(
    async (ev: React.ChangeEvent<HTMLInputElement>) => {
      if (!duck || !ev.target.files?.length) return;

      const file = ev.target.files[0];
      try {
        const data = await ingestFile(duck, ev.target.files[0]);
        if (data.length === 0) {
          toast.error("Cannot upload empty dataset");
          return;
        }
        if (
          !["id", "input_raw", "reference"].every((k) =>
            Object.keys(data[0]).includes(k),
          )
        ) {
          toast.error(
            `Missing column(s)! Need id, input_raw, and reference; got ${Object.keys(data[0]).join(", ")}`,
          );
          return;
        }

        setRows(data);
        setFileMeta({
          name: file.name,
          size: file.size,
          rowCount: data.length,
          colCount: data.length ? Object.keys(data[0]).length : 0,
        });

        const jsonFile = exportAsJson(data);
        form.setValue("datasetFile", jsonFile, {
          shouldValidate: true,
          isDirty: true,
        });
      } catch (e: any) {
        toast.error(e.message ?? "Import failed");
      }
    },
    [duck, form],
  );

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
      {rows.length > 0 ? (
        <div className="flex h-full w-full flex-col">
          <Banner fileMeta={fileMeta} />
          <DataTable data={rows} columns={columns} />
        </div>
      ) : (
        <UploadPrompt fileInput={fileInput} onFile={onFile} />
      )}
    </>
  );
}
