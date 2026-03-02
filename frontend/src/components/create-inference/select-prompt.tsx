import { FormField, FormItem } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import PromptEditor from "./prompt-editor";

function SelectPrompt({ form }: { form: any }) {
  return (
    <FormField
      control={form.control}
      name="prompt"
      render={({ field }) => (
        <FormItem>
          <div className="mb-6">
            <p className="mb-1 text-lg">Prompt</p>
            <p className="text-muted-foreground text-sm">
              This prompt will be used by all models you select in the next
              step.
            </p>
          </div>

          <div className="space-y-4">
            <div className="grid w-full gap-2">
              {/* <span className="text-sm">Prompt Template</span> */}
              {/* <Textarea
                id="promptTemplate"
                value={field.value}
                onChange={(e) => field.onChange(e)}
                className="h-40 w-full rounded border p-2"
              /> */}
              <PromptEditor value={field.value} onChange={(e) => {
                console.log(e);
                field.onChange(e);
              }} />
            </div>
          </div>
        </FormItem>
      )}
    ></FormField>
  );
}

export { SelectPrompt };
