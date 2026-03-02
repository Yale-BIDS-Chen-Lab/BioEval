import { axios } from "@/lib/axios";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { FileIcon, LoaderCircle } from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import PromptEditor from "./prompt-editor";
import { SelectModels } from "./select-models";
import { UploadContainer } from "./upload";
import { useEffect } from "react";

const formSchema = z.object({
  datasetId: z.string().nonempty(),
  prompt: z
    .string()
    .nonempty({
      message: "Prompt can't be empty.",
    })
    .includes("{{input}}", { message: "Prompt must include input variable." }),
  models: z
    .array(
      z.object({
        provider: z.string(),
        model: z.string(),
        parameters: z.array(z.object({ id: z.string(), value: z.any() })),
      }),
    )
    .nonempty({
      message: "Pick at least one model.",
    }),
});

export function Container({ projectId }) {
  const navigate = useNavigate();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: {
      models: [],
    },
  });
  const { isPending, isError, data, error } = useQuery({
    queryKey: ["create-inference-options"],
    queryFn: () => {
      return axios.get("api/inference/options", {
        withCredentials: true,
      });
    },
  });
  const mutation = useMutation({
    mutationFn: async (formData: z.infer<typeof formSchema>) => {
      return axios.post(
        "api/inference/create",
        { ...formData, projectId },
        {
          withCredentials: true,
        },
      );
    },
    onError: (error: any) => {
      // console.log(data, error);
      // toast.error(error.message);
      toast.error(error.response?.data.error);
    },
    onSuccess: () =>
      navigate({
        to: "/dashboard/project/$projectId",
        reloadDocument: true,
        params: {
          projectId,
        },
      }),
  });

  const datasetId = useWatch({
    control: form.control,
    name: "datasetId",
  });

  const { isFetching: isPromptLoading, data: respData } = useQuery({
    queryKey: ["default-prompt", datasetId],
    enabled: !!datasetId,
    queryFn: () =>
      axios.get("api/dataset/get-default-prompt", {
        params: { datasetId },
        withCredentials: true,
      }),
    staleTime: 0,
  });

  useEffect(() => {
    if (respData !== undefined) {
      form.setValue("prompt", (respData.data.defaultPrompt ?? "") + "\n", {
        shouldValidate: true,
      });
    }
  }, [respData, form]);

  if (isPending || isError) {
    return <></>;
  }

  const providers = data.data.providers;

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
          <div className="flex flex-1 flex-col gap-8 overflow-auto px-6 py-8">
            <FormField
              control={form.control}
              name="prompt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prompt</FormLabel>
                  <FormControl>
                    <PromptEditor
                      value={field.value}
                      disabled={isPromptLoading}
                      onChange={(e) => {
                        console.log(e);
                        field.onChange(e);
                      }}
                    />
                  </FormControl>
                  {isPromptLoading && (
                    <div className="bg-background/60 absolute inset-0 z-10 flex items-center justify-center rounded-md backdrop-blur-sm">
                      <LoaderCircle className="size-6 animate-spin" />
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            {/* <FormField
              control={form.control}
              name="models"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prompt</FormLabel>
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
            /> */}
            <SelectModels form={form} providers={providers} />
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
