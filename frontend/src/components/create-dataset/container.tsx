import { axios } from "@/lib/axios";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "../ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Textarea } from "../ui/textarea";
import { UploadContainer } from "./upload";
import PromptEditor from "../create-inference/prompt-editor";
import { ClassesInput } from "./classes-input";

const formSchema = z.object({
  datasetFile: z.instanceof(File),
  name: z.string().nonempty(),
  taskId: z.string().nonempty(),
  description: z.string().nonempty(),
  defaultPrompt: z
    .string()
    .nonempty({
      message: "Prompt can't be empty.",
    })
    .includes("{{input}}", { message: "Prompt must include input variable." }),
  classes: z.array(z.string()).optional(),
});

export function Container() {
  const navigate = useNavigate();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
  });
  const { isPending, isError, data, error } = useQuery({
    queryKey: ["dataset-create-options"],
    queryFn: () => {
      return axios.get("api/dataset/create-options", {
        withCredentials: true,
      });
    },
  });
  const mutation = useMutation({
    mutationFn: async (formData: z.infer<typeof formSchema>) => {
      return axios.put("api/dataset/upload-custom", formData, {
        withCredentials: true,
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onError: (error: any) => {
      toast.error(error.response?.data.error);
      // toast.error(error.message)
    },
    onSuccess: () => navigate({ to: "/dashboard/dataset" }),
  });
  const selectedTaskId = useWatch({
    control: form.control,
    name: "taskId",
  });

  if (isPending || isError) {
    return <></>;
  }

  const tasks = data.data.tasks;
  const needsClasses = ["ner", "mlc"].includes(selectedTaskId);

  async function onSubmit() {
    await mutation.mutateAsync(form.getValues());
  }

  // FIXME: horizontal overflow issue
  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex h-full w-full flex-row overflow-hidden"
      >
        <div className="flex h-full min-w-0 flex-1 basis-1/2">
          <UploadContainer form={form} />
        </div>
        {/* <FormField
          control={form.control}
          name="datasetFile"
          render={({ field }) => (
            <FormItem className="flex flex-col h-full max-w-1/2 basis-1/2">
              <FormControl>
                <UploadContainer form={form} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        /> */}

        <div className="flex h-full min-w-0 flex-1 basis-1/2 flex-col justify-between border-l">
          <div className="flex flex-col gap-8 overflow-auto px-6 py-8">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field}></Input>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="taskId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Task</FormLabel>
                  <Select
                    // {...field}
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="" />
                        {/* <SelectValue placeholder="Select the task your dataset is for" /> */}
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectGroup>
                        {tasks.map((task) => (
                          <SelectItem value={task.id}>{task.name}</SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea {...field} className="h-24" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="defaultPrompt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Default Prompt</FormLabel>
                  <FormControl>
                    <PromptEditor
                      value={field.value}
                      onChange={(e) => {
                        console.log(e);
                        field.onChange(e);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {needsClasses && <ClassesInput form={form} />}
          </div>
          <div className="flex h-18 flex-row items-center justify-end border-t px-6">
            <Button
              size="lg"
              className="cursor-pointer"
              type="submit"
              disabled={!form.formState.isValid || form.formState.isSubmitting}
            >
              {form.formState.isSubmitting && (
                <LoaderCircle className="animate-spin" />
              )}
              Create
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
