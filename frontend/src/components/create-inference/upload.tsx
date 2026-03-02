import type { ColumnDef } from "@tanstack/react-table";
import { Database, File as FileIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Cell, DataTable } from "../dataview-table/table";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogTrigger } from "../ui/dialog";
import { FormControl, FormField, FormItem } from "../ui/form";
import { DatasetBrowser } from "./select-dataset";
import { useQuery } from "@tanstack/react-query";
import { axios } from "@/lib/axios";
import { useNavigate } from "@tanstack/react-router";

function SelectDataset({ form }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
      <div className="flex flex-col items-center justify-center">
        <Button
          type="button"
          className="w-128 cursor-pointer"
          variant="outline"
          onClick={() => {
            navigate({
              to: "/dashboard/dataset/create",
            });
          }}
        >
          {/* <img src="/logos/huggingface.svg" className="size-8" /> */}
          <Database className="size-4" />
          <span>New dataset</span>
        </Button>
      </div>

      <p>OR</p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger>
          <div className="hover:bg-input/30 flex w-128 cursor-pointer flex-col items-center justify-center gap-4 rounded-md border border-dashed p-8 transition select-none">
            <div>
              <FileIcon className="size-8" />
            </div>
            <p>Select existing dataset</p>
          </div>
        </DialogTrigger>
        <DialogContent className="h-160 w-288">
          <DatasetBrowser form={form} close={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Banner({ data }) {
  return (
    <div className="flex items-center gap-6 border-b px-4 py-2 font-mono text-xs">
      <span className="font-semibold">Selected:</span>
      <span>{data.name}</span>
      <span>{data.records.length.toLocaleString()} rows</span>
    </div>
  );
}

function PreviewDataset({ selectedId }) {
  const columns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        accessorKey: "id",
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
        header: () => (
          <div className="text-foreground w-128 text-left font-mono text-xs font-bold">
            Input
          </div>
        ),
        cell: ({ row }) => (
          <Cell value={row.getValue("input")} expanded={row.getIsSelected()} />
        ),
      },
      {
        accessorKey: "reference",
        header: () => (
          <div className="text-foreground w-128 text-left font-mono text-xs font-bold">
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
    ],
    [],
  );

  const { isPending, isError, data } = useQuery({
    queryKey: ["create-inference-dataview"],
    queryFn: () => {
      return axios.get("api/dataset/dataview", {
        withCredentials: true,
        params: {
          datasetId: selectedId,
        },
      });
    },
  });

  if (isPending || isError) {
    return <></>;
  }

  const records = data.data.records;

  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden">
      <Banner data={data.data} />
      <DataTable columns={columns} data={records} />
    </div>
  );
}

export function UploadContainer({ form }) {
  const selectedId = form.watch("datasetId");
  if (selectedId) {
    return (
      <div className="flex h-full w-full flex-col">
        <PreviewDataset selectedId={selectedId} />
      </div>
    );
  }

  return (
    <>
      <FormField
        control={form.control}
        name="datasetId"
        render={({ field }) => (
          <FormItem className="h-full w-full">
            <FormControl>
              <SelectDataset form={form} />
            </FormControl>
          </FormItem>
        )}
      />
    </>
  );
}
