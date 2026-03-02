"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "../data-table-column-header";
import { DataTableRowActions } from "../data-table-row-actions";
import { statuses, type Inference } from "@/schemas/inference";
import { useNavigate, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const columns: ColumnDef<Inference>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
        className="translate-y-[2px]"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
        className="translate-y-[2px]"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "inferenceId",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="ID" />
    ),
    cell: ({ row }) => {
      const { projectId } = useParams({
        from: "/_authed/dashboard/project/$projectId/",
      });
      const navigate = useNavigate();
      const isFavorite = row.original.isFavorite;

      return (
        <div
          className="flex items-center gap-2 cursor-pointer hover:underline"
          onClick={() => {
            const status = row.getValue("status");
            if (status === "failed") {
              toast.error("This inference failed. Please check the logs or try again.");
              return;
            }
            if (status === "pending" || status === "processing") {
              toast.info("Please wait until inference is completed");
              return;
            }
            // Allow viewing "done" and "canceled" inferences
            navigate({
              to: "/dashboard/project/$projectId/inference/$inferenceId",
              params: {
                projectId,
                inferenceId: row.getValue("inferenceId")!,
              },
            });
          }}
        >
          {isFavorite && (
            <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400 flex-shrink-0" />
          )}
          <span className="w-[80px]">{row.getValue("inferenceId")}</span>
        </div>
      );
    },
    enableSorting: false,
    enableColumnFilter: false,
    enableHiding: false,
  },
  {
    accessorKey: "isFavorite",
    // Hidden column used only for sorting
    header: () => null,
    cell: () => null,
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: "task",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Task" />
    ),
    cell: ({ row }) => {
      const taskName = row.getValue("task") as string;
      
      // Color coding for different task types (same as datasets page)
      const taskColors: Record<string, string> = {
        "Multiple Choice Questions": "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
        "Named-entity Recognition": "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
        "Relation Extraction": "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
        "Multi-label Classification": "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
        "Generation": "bg-pink-500/10 text-pink-700 dark:text-pink-400 border-pink-500/20",
      };

      const taskColorClass = taskColors[taskName] || "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20";

      return (
        <Badge variant="outline" className={taskColorClass}>
          {taskName}
        </Badge>
      );
    },
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "dataset",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Dataset" />
    ),
    cell: ({ row }) => {
      return <div>{row.getValue("dataset")}</div>;
    },
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "model",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Model" />
    ),
    cell: ({ row }) => {
      const provider = row.original.providerId;
      return (
        <div className="flex space-x-2">
          <div className="flex max-w-[500px] flex-row items-center gap-2 truncate font-medium">
            <img
              src={`/logos/${provider}.svg`}
              alt="Provider logo"
              width={24}
              height={24}
              className="select-none"
            />
            <span>{row.getValue("model")}</span>
          </div>
        </div>
      );
    },
    enableHiding: false,
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const status = statuses.find(
        (status) => status.value === row.getValue("status"),
      );
      const totalExamples = row.original.totalExamples;
      const processedExamples = row.original.processedExamples;
      const isProcessing = row.getValue("status") === "processing";

      if (!status) {
        return null;
      }

      // Show progress bar if processing and we have progress data
      if (isProcessing && totalExamples && processedExamples !== null && processedExamples !== undefined) {
        const percentage = Math.round((processedExamples / totalExamples) * 100);
        
        return (
          <div className="flex flex-col gap-1.5 w-[140px]">
            <div className="flex items-center gap-2">
              {status.icon && (
                <status.icon className="text-muted-foreground h-4 w-4 flex-shrink-0" />
              )}
              <span className="text-sm">{status.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-500 h-full transition-all duration-300 ease-out"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {processedExamples}/{totalExamples}
              </span>
            </div>
          </div>
        );
      }

      return (
        <div className="flex w-[100px] items-center">
          {status.icon && (
            <status.icon className="text-muted-foreground mr-2 h-4 w-4" />
          )}
          <span>{status.label}</span>
        </div>
      );
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
    enableHiding: false,
  },
  {
    id: "actions",
    cell: ({ row }) => <DataTableRowActions row={row} />,
  },
];
