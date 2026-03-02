import { Checkbox } from "@/components/ui/checkbox";
import { FormField, FormItem } from "@/components/ui/form";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ConfigureLLMJudge, getDefaultConfig } from "./configure-llm-judge";

function SelectMetrics({ metrics, form, llmJudgeConfig }: { metrics: any[]; form: any; llmJudgeConfig?: any }) {
  return (
    <FormField
      control={form.control}
      name="metrics"
      render={({ field }) => (
        <FormItem>
          <div className="mb-6">
            <p className="mb-1 text-xl">Metrics</p>
            <p className="text-muted-foreground text-sm">
              Select the metrics that should be calculated.
            </p>
          </div>

          <ScrollArea className="h-[250px] overflow-y-hidden rounded-sm border p-2">
            <div className="flex h-full flex-col gap-4">
              {metrics.map((metric) => {
                const isChecked = field.value?.includes(metric.metricId);
                const isLlmJudge = metric.metricId.startsWith("llm_judge_");
                return (
                  <div key={metric.metricId} className="flex flex-row items-center gap-2">
                    <Checkbox
                      className="mr-2"
                      checked={isChecked}
                      onCheckedChange={(e) => {
                        const checked = e === true;
                        if (checked) {
                          form.setValue(
                            "metrics",
                            [...field.value, metric.metricId],
                            {
                              shouldValidate: true,
                            },
                          );
                          // Auto-populate default config for LLM judge metrics
                          if (isLlmJudge && !llmJudgeConfig?.[metric.metricId]) {
                            const criterion = metric.metricId.replace("llm_judge_", "");
                            form.setValue(`llmJudgeConfig.${metric.metricId}`, getDefaultConfig(criterion));
                          }
                        } else {
                          form.setValue(
                            "metrics",
                            field.value.filter(
                              (v: string) => v != metric.metricId,
                            ),
                            {
                              shouldValidate: true,
                            },
                          );
                        }
                      }}
                    />
                    <span>{metric.name}</span>
                    {isLlmJudge && isChecked && (
                      <ConfigureLLMJudge
                        metricId={metric.metricId}
                        form={form}
                        initialConfig={llmJudgeConfig?.[metric.metricId]}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </FormItem>
      )}
    ></FormField>
  );
}

export { SelectMetrics };
