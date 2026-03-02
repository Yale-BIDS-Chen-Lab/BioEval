import { FormField, FormItem, FormMessage } from "../ui/form";
import { Input } from "../ui/input";

function SelectName({ form }: { form: any }) {
  return (
    <FormField
      control={form.control}
      name="name"
      render={({ field }) => (
        <FormItem>
          <p className="mb-6 text-lg">Project Name</p>
          <Input
            type="text"
            className="w-full text-left"
            placeholder="My Project"
            defaultValue={field.value}
            onChange={(e) => {
              field.onChange(e.target.value);
            }}
          />
          <FormMessage />
        </FormItem>
      )}
    ></FormField>
  );
}

export { SelectName };
