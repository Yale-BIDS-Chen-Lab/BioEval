import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../ui/button";
import { Form } from "../ui/form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { axios } from "@/lib/axios";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { SelectName } from "./name";

const formSchema = z.object({
  name: z.string().nonempty(),
});

function Container() {
  const [step, setStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: (formData: z.infer<typeof formSchema>) => {
      // TODO: proxy backend requests
      return axios.post("api/project/create", formData, {
        withCredentials: true,
      });
    },
    onError: (error: any) => {
      toast.error(error.response?.data.error);
      // toast.error(error.message)
    },
    onSuccess: (_) => {
      navigate({ to: "/dashboard/project" });
    },
    onSettled: () => {
      setIsLoading(false);
    },
  });
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
    },
  });

  const steps: [keyof z.infer<typeof formSchema>, any][] = [
    ["name", SelectName],
  ];
  const CurrentComponent = steps[step][1];

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      console.log("Submitting", form.getValues());
      setIsLoading(true);
      mutation.mutate(form.getValues());
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
        <div className="bg-input/30 flex min-h-[450px] flex-col rounded-md border px-4 py-4 md:px-6">
          <div className="mb-8 flex items-center justify-center gap-2">
            {/* {[...Array(steps.length)].map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-all ${
                  i <= step ? "bg-primary" : "bg-muted-foreground/30"
                }`}
              />
            ))} */}
          </div>

          <div className="flex-1">
            <Form {...form}>
              <form>
                <div className={`${isLoading ? "pointer-events-none" : ""}`}>
                  <CurrentComponent form={form} />
                </div>
              </form>
            </Form>
          </div>

          <div className="mt-12 flex justify-between">
            {step > 0 ? (
              <Button
                variant="outline"
                onClick={() => setStep(step - 1)}
                className="cursor-pointer"
                disabled={isLoading}
              >
                <ChevronLeft />
                Back
              </Button>
            ) : (
              <div />
            )}
            <Button
              onClick={handleNext}
              className="cursor-pointer"
              disabled={!form.watch(steps[step][0]) || isLoading}
            >
              {step === steps.length - 1 ? "Create" : "Next"}
              {isLoading ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <ChevronRight />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { Container };
