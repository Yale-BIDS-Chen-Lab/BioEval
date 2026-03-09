"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "../data-table-column-header";
import { DataTableRowActions } from "../data-table-row-actions";
import { statuses } from "@/schemas/inference";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";

type EvaluationRow = {
  evaluationId: string;
  status: "pending" | "processing" | "done" | "failed" | "canceled";
  metrics: string[];
  createdAt?: string | null;
};

function formatCreatedAt(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export const columns: ColumnDef<EvaluationRow>[] = [
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
    accessorKey: "evaluationId",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="ID" />
    ),
    cell: ({ row }) => {
      const { projectId, inferenceId } = useParams({
        from: "/_authed/dashboard/project/$projectId/inference/$inferenceId/evaluation/",
      });
      const navigate = useNavigate();

      return (
        <div
          className="w-[80px] cursor-pointer hover:underline"
          onClick={() =>
            navigate({
              to: "/dashboard/project/$projectId/inference/$inferenceId/evaluation/$evaluationId",
              params: {
                projectId,
                inferenceId,
                evaluationId: row.getValue("evaluationId")!,
              },
            })
          }
        >
          <div className="w-[80px]">{row.getValue("evaluationId")}</div>
        </div>
      );
    },
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created" />
    ),
    cell: ({ row }) => (
      <div className="min-w-[170px] whitespace-nowrap">
        {formatCreatedAt(row.original.createdAt)}
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "metrics",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Metrics" />
    ),
    cell: ({ row }) => {
      // TODO: sync types with backend
      const metrics: string[] = row.getValue("metrics");
      const maxShown = 3;

      const [showAll, setShowAll] = useState(false);
      const shownMetrics = showAll ? metrics : metrics.slice(0, maxShown);
      const remaining = metrics.length - maxShown;

      return (
        <div className="flex max-w-[400px] flex-wrap gap-2">
          {shownMetrics.map((metric, i) => (
            <Badge key={i} variant="secondary">
              {metric}
            </Badge>
          ))}

          {metrics.length > maxShown && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              className="text-primary text-xs font-medium hover:underline"
            >
              {remaining} more...
            </button>
          )}

          {showAll && (
            <button
              onClick={() => setShowAll(false)}
              className="text-primary text-xs font-medium hover:underline"
            >
              Show less
            </button>
          )}
        </div>
      );
    },
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

      if (!status) {
        return null;
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
  },
  {
    id: "actions",
    cell: ({ row }) => <DataTableRowActions row={row} type="evaluation" />,
  },
];
