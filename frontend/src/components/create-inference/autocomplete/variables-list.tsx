import React, { useEffect, useImperativeHandle, useState } from "react";
import { type VariableItem } from "./suggestion";

export interface SuggestionListProps {
  items: VariableItem[];
  command: (item: VariableItem) => void;
  ref: React.MutableRefObject<{
    onKeyDown: (params: { event: KeyboardEvent }) => boolean;
  } | null>;
}

export default (props: SuggestionListProps) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = (index: number) => {
    const item = props.items[index];
    if (item) props.command(item);
  };

  const upHandler = () =>
    setSelectedIndex(
      (selectedIndex + props.items.length - 1) % props.items.length,
    );

  const downHandler = () =>
    setSelectedIndex((selectedIndex + 1) % props.items.length);

  const enterHandler = () => selectItem(selectedIndex);

  useEffect(() => setSelectedIndex(0), [props.items]);

  useImperativeHandle(props.ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === "ArrowUp") {
        upHandler();
        return true;
      }
      if (event.key === "ArrowDown") {
        downHandler();
        return true;
      }
      if (event.key === "Enter") {
        enterHandler();
        return true;
      }
      return false;
    },
  }));

  return (
    <div className="dropdown-menu bg-popover text-popover-foreground flex min-w-18 flex-col rounded-sm border p-1 shadow-lg">
      {props.items.length ? (
        props.items.map((item, index) => (
          <button
            key={item.id}
            className={`flex w-full items-center justify-start rounded-sm p-1 font-mono text-sm transition-colors ${
              index === selectedIndex
                ? "bg-accent text-accent-foreground"
                : "hover:bg-accent/60 hover:text-accent-foreground"
            }`}
            onClick={() => selectItem(index)}
          >
            {item.label}
          </button>
        ))
      ) : (
        <div className="text-muted-foreground p-2 text-sm">No result</div>
      )}
    </div>
  );
};
