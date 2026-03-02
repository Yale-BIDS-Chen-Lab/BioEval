"use client";

import { type Table } from "@tanstack/react-table";
import { Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSubContent,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";

interface DataTableViewOptionsProps<TData> {
  table: Table<TData>;
}

export function DataTableViewOptions<TData>({
  table,
}: DataTableViewOptionsProps<TData>) {
  function toTitleCase(str) {
    return str.replace(
      /\w\S*/g,
      (text) => text.charAt(0).toUpperCase() + text.substring(1).toLowerCase(),
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto hidden h-8 lg:flex"
        >
          <Settings2 />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[150px]">
        <DropdownMenuLabel>Filter columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {table
          .getAllColumns()
          .filter(
            (column) =>
              typeof column.accessorFn !== "undefined" && column.getCanFilter(),
          )
          .map((column) => {
            const uniqueValues = Array.from(
              column.getFacetedUniqueValues().keys(),
            );
            const current = (column.getFilterValue() as string) ?? "all";
            const setValue = (value: string) =>
              column.setFilterValue(value === "all" ? undefined : value);

            return (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  {toTitleCase(column.id)}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent key={column.id}>
                  <DropdownMenuRadioGroup
                    value={current}
                    onValueChange={setValue}
                  >
                    <DropdownMenuRadioItem value="all">
                      Show all
                    </DropdownMenuRadioItem>

                    {uniqueValues.map((val) => (
                      <DropdownMenuRadioItem
                        key={String(val)}
                        value={String(val)}
                      >
                        {String(val)}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            );
          })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
