import Mention from "@tiptap/extension-mention";
import { EditorContent, useEditor } from "@tiptap/react";
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import HardBreak from '@tiptap/extension-hard-break';
import clsx from "clsx";
import Suggestion from "./autocomplete/suggestion";
import { useEffect, useRef } from "react";

type PromptEditorProps = {
  value: string;
  onChange: (text: string) => void;
  className?: string;
  disabled?: boolean;
};

type VariableItem = {
  id: string;
  label: string;
  value: string;
};

const variables: VariableItem[] = [
  { id: "input", label: "input", value: "{{input}}" },
];

export default function PromptEditor({
  value,
  onChange,
  className,
  disabled,
}: PromptEditorProps) {
  const isInternalUpdate = useRef(false);
  
  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak.configure({
        keepMarks: false,
      }).extend({
        addKeyboardShortcuts() {
          return {
            'Enter': () => {
              // Insert a newline character directly instead of creating a new paragraph
              return this.editor.commands.first(({ commands }) => [
                () => commands.insertContent('\n'),
                () => commands.setHardBreak(),
              ]);
            },
          };
        },
      }),
      Mention.configure({
        HTMLAttributes: {
          class: "mention",
        },
        // @ts-ignore
        suggestion: Suggestion(variables),
      }),
    ],
    autofocus: true,
    editorProps: {
      attributes: {
        class: "h-full w-full overflow-auto outline-none [&_p]:block [&_p]:my-0",
      },
    },
    onUpdate: ({ editor }) => {
      isInternalUpdate.current = true;
      
      // Convert TipTap content back to plain text with \n
      const json = editor.getJSON();
      let text = '';
      
      if (json.content) {
        for (let i = 0; i < json.content.length; i++) {
          const node = json.content[i];
          if (node.type === 'paragraph') {
            if (node.content) {
              for (const childNode of node.content) {
                if (childNode.type === 'text') {
                  text += childNode.text;
                } else if (childNode.type === 'hardBreak') {
                  text += '\n';
                }
              }
            }
            // Add newline after each paragraph (except the last one)
            if (i < json.content.length - 1) {
              text += '\n';
            }
          }
        }
      }
      
      if (text !== value) onChange(text);
      setTimeout(() => {
        isInternalUpdate.current = false;
      }, 0);
    },
  });

  useEffect(() => {
    if (editor && !isInternalUpdate.current && value !== undefined && value !== null) {
      // Convert plain text with \n to TipTap structure
      const lines = (value || '').split('\n');
      const content = lines.map(line => ({
        type: 'paragraph',
        content: line ? [{ type: 'text', text: line }] : [],
      }));
      
      const newContent = { type: 'doc', content };
      const currentContent = editor.getJSON();
      
      // Only update if content actually changed
      if (JSON.stringify(currentContent) !== JSON.stringify(newContent)) {
        editor.commands.setContent(newContent, false);
      }
    }
  }, [value, editor]);

  return (
    <div
      className={clsx(
        "focus-within:border-ring focus-within:ring-ring/50 h-64 max-w-none rounded-md border p-2 shadow-xs transition-[color,box-shadow] focus-within:ring-[3px]",
        className,
      )}
    >
      <EditorContent
        editor={editor}
        disabled={disabled}
        className="h-full w-full"
      />
    </div>
  );
}
