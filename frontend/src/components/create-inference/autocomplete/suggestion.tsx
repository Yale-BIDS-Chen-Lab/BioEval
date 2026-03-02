import { Editor } from "@tiptap/core";
import type { MentionNodeAttrs } from "@tiptap/extension-mention";
import { ReactRenderer } from "@tiptap/react";
import type {
  SuggestionKeyDownProps,
  SuggestionProps,
} from "@tiptap/suggestion";
import tippy, { type Instance, type Props as TippyProps } from "tippy.js";
import MentionList from "./variables-list";

type ItemsCtx = { query: string; editor: Editor };

export interface VariableItem extends MentionNodeAttrs {
  value: string;
}

export default (variables: VariableItem[]) => {
  return {
    char: "{{",

    items: ({ query }: ItemsCtx): VariableItem[] =>
      variables
        .filter(({ label }) =>
          label!.toLowerCase().startsWith(query.toLowerCase()),
        )
        .slice(0, 5),

    command({
      editor,
      range,
      props,
    }: {
      editor: Editor;
      range: { from: number; to: number };
      props: VariableItem;
    }) {
      editor
        .chain()
        .focus()
        .insertContentAt(range, props.value + " ")
        .run();
    },

    render: () => {
      let component: ReactRenderer | undefined;
      let popup: Instance[] | undefined;

      return {
        onStart(props: SuggestionProps) {
          component = new ReactRenderer(MentionList, {
            props,
            editor: props.editor,
          });

          if (!props.clientRect) return;

          // @ts-ignore
          popup = tippy("body", {
            getReferenceClientRect: props.clientRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
          });
        },

        onUpdate(props: SuggestionProps) {
          component?.updateProps(props);
          if (!props.clientRect || !popup) return;

          popup[0].setProps({
            getReferenceClientRect: props.clientRect,
          } as Partial<TippyProps>);
        },

        onKeyDown(props: SuggestionKeyDownProps) {
          if (props.event.key === "Escape") {
            popup?.[0].hide();
            return true;
          }

          // @ts-ignore
          return component.ref.onKeyDown(props) ?? false;
        },

        onExit() {
          popup?.[0].destroy();
          component?.destroy();
        },
      };
    },
  };
};
