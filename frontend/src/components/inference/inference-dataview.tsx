import { SearchIcon, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { axios } from "@/lib/axios";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DataTable, Cell } from "../dataview-table/table";
import type { ColumnDef } from "@tanstack/react-table";
import { NotesCell, OutputCell } from "../evaluation/evaluation-dataview";

export function DataView({ data }: { data: any }) {
  const { projectId, inferenceId } = useParams({
    from: "/_authed/dashboard/project/$projectId/inference/$inferenceId/",
  });

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

  const [searchQuery, setSearchQuery] = useState("");

  const download = () => {
    const a = document.createElement("a");
    const file = new Blob([JSON.stringify(data)], {
      type: "application/json",
    });
    a.href = URL.createObjectURL(file);
    a.download = "export.json";
    a.click();
  };

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
      {
        accessorKey: "output",
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
        id: "notes",
        header: () => (
          <div className="text-foreground w-128 text-left font-mono text-xs font-bold">
            Comments
          </div>
        ),
        cell: ({ row }) => <NotesCell row={row} inferenceId={inferenceId} />,
      },
    ],
    [inferenceId, highlights],
  );

  return (
    <>
      <div className="flex h-14 w-full flex-shrink-0 items-center justify-between border-b px-4">
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
        <Button
          variant="ghost"
          size="sm"
          className="cursor-pointer"
          onClick={download}
        >
          <Download className="h-4 w-4" />
        </Button>
      </div>

      <DataTable
        data={data}
        columns={columns}
        globalFilter={searchQuery}
        onGlobalFilterChange={setSearchQuery}
      />
    </>
  );
}
