import { z, type ZodTypeAny } from "zod";
import { useEffect, useState } from "react";
import { useForm, type FieldValues, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { useWatch, type FieldPath } from "react-hook-form";

export type Step<FormValues extends FieldValues> = {
  id: string;
  label?: string;
  render: (form: UseFormReturn<FormValues>) => React.ReactNode;
  fields?: FieldPath<FormValues>[];
};

interface MultiStepFormProps<TSchema extends ZodTypeAny> {
  schema: TSchema;
  defaultValues: z.infer<TSchema>;
  steps: Step<z.infer<TSchema>>[];
  onSubmit: (values: z.infer<TSchema>) => Promise<void> | void;
  submitting?: boolean;
}

export function MultiStepForm<TSchema extends ZodTypeAny>({
  schema,
  defaultValues,
  steps,
  onSubmit,
  submitting = false,
}: MultiStepFormProps<TSchema>) {
  const [stepIndex, setStepIndex] = useState(0);

  const form = useForm<z.infer<TSchema>>({
    resolver: zodResolver(schema),
    defaultValues,
    mode: "onChange",
  });

  useEffect(() => {
    form.trigger();
  }, []);

  const CurrentStep = steps[stepIndex].render;

  async function goNext() {
    const valid = steps[stepIndex].fields
      ? await form.trigger(steps[stepIndex].fields as any)
      : await form.trigger();

    if (!valid) return;

    if (stepIndex < steps.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      const ok = await form.trigger();
      if (!ok) return;
      await onSubmit(form.getValues());
    }
  }

  const step = steps[stepIndex];
  const stepFields = step.fields ?? [];
  useWatch({
    control: form.control,
    name: stepFields as FieldPath<z.infer<TSchema>>[],
  });
  const stepIsValid = stepFields.length
    ? stepFields.every((f) => !form.getFieldState(f).invalid)
    : form.formState.isValid;

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="flex min-h-[450px] flex-col rounded-md border px-4 py-4 md:px-6">
        <div className="mb-8 flex items-center justify-center gap-2">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all ${
                i <= stepIndex ? "bg-primary" : "bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>

        <Form {...form}>
          <form className={`${submitting ? "pointer-events-none" : ""} flex-1`}>
            {/* <CurrentStep form={form} /> */}
            {CurrentStep(form)}
          </form>
        </Form>

        <div className="mt-12 flex justify-between">
          {stepIndex > 0 ? (
            <Button
              variant="outline"
              onClick={() => setStepIndex((i) => i - 1)}
              className="cursor-pointer"
              disabled={submitting}
              type="button"
            >
              <ChevronLeft className="mr-1 h-4 w-4" /> Back
            </Button>
          ) : (
            <div />
          )}
          <Button
            onClick={goNext}
            className="cursor-pointer"
            disabled={submitting || !stepIsValid}
            type="button"
          >
            {stepIndex === steps.length - 1 ? "Submit" : "Next"}
            {submitting ? (
              <LoaderCircle className="ml-2 h-4 w-4 animate-spin" />
            ) : (
              stepIndex !== steps.length - 1 && (
                <ChevronRight className="ml-1 h-4 w-4" />
              )
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
