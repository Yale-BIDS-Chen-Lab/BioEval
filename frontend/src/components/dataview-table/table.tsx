import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Columns2,
} from "lucide-react";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Checkbox } from "../ui/checkbox";

export interface DataTableProps<T extends object> {
  data: T[];
  columns: ColumnDef<T, any>[];

  globalFilter?: string;
  onGlobalFilterChange?: (v: string) => void;
  initialState?: Parameters<typeof useReactTable<T>>[0]["initialState"];
  onRowClick?: (row: Row<T>) => void;
  /** Show "Columns" dropdown to toggle column visibility. Default true. */
  showColumnVisibility?: boolean;

  className?: string;
}

function buildPageList(current: number, total: number) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);

  const end = total - 1;
  if (current <= 2) return [0, 1, 2, "ellipsis", end];
  if (current >= end - 2) return [0, "ellipsis", end - 2, end - 1, end];

  return [0, "ellipsis", current - 1, current, current + 1, "ellipsis", end];
}

export function DataTable<T extends object>({
  data,
  columns,
  globalFilter: extFilter,
  onGlobalFilterChange: extSetFilter,
  initialState,
  onRowClick,
  showColumnVisibility = true,
  className = "",
}: DataTableProps<T>) {
  const [intFilter, setIntFilter] = useState("");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const filter = extFilter ?? intFilter;
  const setFilter = extSetFilter ?? setIntFilter;

  const table = useReactTable({
    data,
    columns,
    state: { globalFilter: filter, columnVisibility },
    onGlobalFilterChange: setFilter,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState: { pagination: { pageSize: 50 }, ...initialState },
    enableMultiRowSelection: false,
  });

  return (
    <div className={`relative flex min-h-0 flex-1 flex-col ${className}`}>
      {showColumnVisibility && (
        <div className="flex flex-shrink-0 justify-end border-b px-2 py-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
                <Columns2 className="h-4 w-4" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-[min(70vh,400px)] w-56 overflow-y-auto">
              <DropdownMenuLabel>Show / hide columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table.getAllLeafColumns().map((column) => {
                const label = (column.columnDef.meta as { label?: string } | undefined)?.label ?? column.id;
                return (
                  <label
                    key={column.id}
                    className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <Checkbox
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) => column.toggleVisibility(!!value)}
                    />
                    <span className="truncate">{label}</span>
                  </label>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      <div className="h-full flex-1 overflow-auto">
        <Table className="w-full border-separate border-spacing-0">
          <TableHeader className="sticky top-0">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => {
                  const size = header.column.getSize();
                  const hasWidth = size !== 150;
                  return (
                  <TableHead
                    key={header.id}
                    className="bg-background cursor-pointer border-r border-b px-6 py-4 align-top select-none last:border-r-0"
                    style={hasWidth ? { width: size, maxWidth: size, minWidth: size } : undefined}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {/* {flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )} */}
                    <div className={`flex items-center gap-1 ${hasWidth ? "min-w-0 overflow-hidden" : ""}`}>
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                      {header.column.getIsSorted() === "asc" && (
                        <ChevronUp className="size-4" />
                      )}
                      {header.column.getIsSorted() === "desc" && (
                        <ChevronDown className="size-4" />
                      )}
                    </div>
                  </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} onClick={() => onRowClick?.(row)}>
                {row.getVisibleCells().map((cell) => {
                  const size = cell.column.getSize();
                  const hasWidth = size !== 150;
                  return (
                  <TableCell
                    key={cell.id}
                    onClick={row.getToggleSelectedHandler()}
                    style={hasWidth ? { width: size, maxWidth: size, minWidth: size } : undefined}
                    className={`cursor-pointer border-r border-b px-6 py-4 align-top last:border-r-0 ${hasWidth ? "overflow-hidden" : ""}`}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-center gap-6 border-t px-4 py-2 font-mono text-xs">
        <button
          type="button"
          disabled={!table.getCanPreviousPage()}
          onClick={() => table.previousPage()}
          className="flex cursor-pointer items-center gap-1 disabled:opacity-40"
        >
          <ChevronLeft className="-mt-px size-3" />
          <span>Previous</span>
        </button>

        <div className="flex items-center gap-2">
          {buildPageList(
            table.getState().pagination.pageIndex,
            table.getPageCount(),
          ).map((p, idx) =>
            p === "ellipsis" ? (
              <span key={`e${idx}`} className="select-none">
                ...
              </span>
            ) : (
              <button
                key={p}
                onClick={() => table.setPageIndex(p as number)}
                className={`cursor-pointer rounded px-2 py-1 ${
                  table.getState().pagination.pageIndex === p
                    ? "bg-muted font-semibold"
                    : "hover:bg-muted/50"
                }`}
              >
                {(p as number) + 1}
              </button>
            ),
          )}
        </div>

        <button
          type="button"
          disabled={!table.getCanNextPage()}
          onClick={() => table.nextPage()}
          className="flex cursor-pointer items-center justify-center gap-1 disabled:opacity-40"
        >
          <span>Next</span>
          <ChevronRight className="-mt-px size-3" />
        </button>
      </div>
    </div>
  );
}

export const Cell = ({
  value,
  expanded,
}: {
  value: string;
  expanded: boolean;
}) => (
  <div
    className={`text-foreground ${expanded ? "" : "line-clamp-2"} overflow-hidden font-mono text-xs text-ellipsis whitespace-pre-wrap`}
  >
    {value}
  </div>
);
