import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

function ProviderSelect({ form, providers }) {
  return (
    <FormField
      control={form.control}
      name="provider"
      render={({ field }) => (
        <Select onValueChange={field.onChange} value={field.value}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choose a provider" />
          </SelectTrigger>

          <SelectContent>
            {providers.map((p) => (
              <SelectItem
                key={p.providerId}
                value={p.providerId}
                className="hover:bg-muted flex cursor-pointer items-center gap-3 rounded-lg p-2"
              >
                <img
                  src={`/logos/${p.providerId}.svg`}
                  alt={`${p.name} logo`}
                  width={24}
                  height={24}
                  className="select-none"
                />
                <span className="text-sm">{p.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  );
}

function ModelSelect({ form, models }) {
  return (
    <FormField
      control={form.control}
      name="model"
      render={({ field }) => (
        <Select onValueChange={field.onChange} value={field.value}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choose a model" />
          </SelectTrigger>

          <SelectContent>
            {models.length === 0 && (
              <p className="text-muted-foreground p-4 text-center text-sm">
                No results
              </p>
            )}

            {models.map((m) => (
              <SelectItem
                key={m.id}
                value={m.name}
                className="hover:bg-muted flex cursor-pointer items-center gap-3 rounded-lg p-2"
              >
                <img
                  src={`/logos/${form.watch("provider")}.svg`}
                  alt="Provider logo"
                  width={24}
                  height={24}
                  className="select-none"
                />
                <span className="text-sm">{m.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  );
}

import {
  FormControl,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import { ChevronDown, Info } from "lucide-react";
import { useEffect } from "react";
import { useWatch } from "react-hook-form";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";
import { Input } from "../ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

const AZURE_REASONING_PARAM_IDS = ["max_tokens", "reasoning_effort"];

function AddModelPopup({ form, onAdd, providers }) {
  const providerId = useWatch({ control: form.control, name: "provider" });
  const model = useWatch({ control: form.control, name: "model" });
  const currentProvider = providers.find((p) => p.providerId === providerId);
  const doSampleValue = useWatch({ control: form.control, name: "parameters.do_sample" });

  const isAzureReasoningModel =
    currentProvider?.providerId === "azure" &&
    currentProvider?.reasoningModelIds?.includes(model);

  const visibleParameters = currentProvider?.parameters?.filter((p) => {
    if (isAzureReasoningModel) {
      // For reasoning models: only show max_tokens and reasoning_effort
      return AZURE_REASONING_PARAM_IDS.includes(p.id);
    } else if (currentProvider?.providerId === "azure") {
      // For non-reasoning Azure models: hide reasoning_effort
      return p.id !== "reasoning_effort";
    }
    // For other providers: show all parameters
    return true;
  }) ?? [];

  useEffect(() => {
    if (!currentProvider) return;
    const defaults = {};
    currentProvider.parameters.forEach(
      (p) => (defaults[p.id] = p.defaultValue),
    );
    form.setValue("parameters", defaults, { shouldValidate: false });
  }, [providerId]);

  // Clear/restore sampling parameters when do_sample changes
  useEffect(() => {
    if (!currentProvider) return;
    
    const samplingParams = ["temperature", "top_k", "top_p"];
    
    if (doSampleValue === false) {
      // Clear sampling parameters when disabled
      samplingParams.forEach(param => {
        form.setValue(`parameters.${param}`, undefined, { shouldValidate: false });
      });
    } else if (doSampleValue === true) {
      // Restore default values when enabled
      samplingParams.forEach(param => {
        const paramConfig = currentProvider.parameters.find(p => p.id === param);
        if (paramConfig && form.getValues(`parameters.${param}`) === undefined) {
          form.setValue(`parameters.${param}`, paramConfig.defaultValue, { shouldValidate: false });
        }
      });
    }
  }, [doSampleValue, currentProvider]);

  const models = currentProvider?.models ?? [];

  function handleAdd() {
    const provider = form.getValues("provider");
    const model = form.getValues("model");
    if (!provider || !model) return;

    const paramObj = form.getValues("parameters") || {};
    
    let filteredParams = Object.entries(paramObj);
    if (provider === "azure" && currentProvider?.reasoningModelIds?.includes(model)) {
      // For reasoning models: only keep max_tokens and reasoning_effort
      filteredParams = filteredParams.filter(([id]) =>
        AZURE_REASONING_PARAM_IDS.includes(id)
      );
    } else if (provider === "azure") {
      // For non-reasoning Azure models: remove reasoning_effort
      filteredParams = filteredParams.filter(([id]) => id !== "reasoning_effort");
    } else {
      // For HuggingFace: filter out sampling parameters if do_sample is false
      const samplingParams = ["temperature", "top_k", "top_p"];
      filteredParams = filteredParams.filter(([id, value]) => {
        if (paramObj.do_sample === false && samplingParams.includes(id)) {
          return false;
        }
        return true;
      });
    }
    
    // Build parameters with defaults: if value is undefined/null/"", use the param's defaultValue
    const parameters = filteredParams
      .map(([id, value]) => {
        const paramConfig = currentProvider?.parameters.find(p => p.id === id);
        let finalValue = value;
        
        // If value is undefined, null, or empty string, use the default value
        if (value === undefined || value === null || value === "") {
          finalValue = paramConfig?.defaultValue;
        }
        
        // Only include if we have a valid final value
        if (finalValue === undefined || finalValue === null || finalValue === "") {
          return null;
        }
        
        return { id, value: finalValue };
      })
      .filter(param => param !== null);

    onAdd({ provider, model, parameters });

    form.resetField("provider");
    form.resetField("model");
    form.resetField("parameters");
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label className="text-right">Provider Name</Label>
        <ProviderSelect form={form} providers={providers} />
      </div>

      <div className="space-y-2">
        <Label className="text-right">Model Name</Label>
        <ModelSelect form={form} models={models} />
      </div>

      {visibleParameters.length > 0 && (
        <Collapsible className="w-full">
          <CollapsibleTrigger asChild>
            <Button
              variant="outline"
              className="w-full cursor-pointer justify-between"
              type="button"
            >
              Parameters
              <ChevronDown className="ml-2 h-4 w-4 transition-transform data-[state=open]:rotate-180" />
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent className="space-y-4 pt-4">
            {visibleParameters.map((p) => {
              const schema = p.schema ?? {};
              const isBoolean = schema.type === "boolean";
              const enumOptions = Array.isArray(schema.enum)
                ? (schema.enum as string[])
                : p.id === "reasoning_effort"
                  ? ["low", "medium", "high"]
                  : null;
              const isEnum = enumOptions !== null && enumOptions.length > 0;
              
              const doSampleValue = form.watch("parameters.do_sample");
              const samplingParams = ["temperature", "top_k", "top_p"];
              if (samplingParams.includes(p.id) && doSampleValue === false) {
                return null;
              }
              
              return (
                <FormField
                  key={p.id}
                  control={form.control}
                  name={`parameters.${p.id}`}
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center gap-2">
                        <FormLabel className="text-xs">{p.name}</FormLabel>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-muted-foreground cursor-help">
                              <Info className="size-4" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs text-xs">
                            {p.description}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <FormControl>
                        {isBoolean ? (
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        ) : isEnum ? (
                          <Select
                            value={String(field.value ?? p.defaultValue ?? "")}
                            onValueChange={field.onChange}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={`Select ${p.name}`} />
                            </SelectTrigger>
                            <SelectContent>
                              {enumOptions.map((opt) => (
                                <SelectItem key={opt} value={opt}>
                                  {opt}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            type="number"
                            value={field.value ?? ""}
                            onChange={(e) => {
                              const value = e.target.value === "" ? "" : Number(e.target.value);
                              field.onChange(value);
                            }}
                            min={schema.minimum}
                            max={schema.maximum}
                            step="any"
                          />
                        )}
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              );
            })}
          </CollapsibleContent>
        </Collapsible>
      )}

      <Button
        type="button"
        onClick={handleAdd}
        disabled={!form.watch("provider") || !form.watch("model")}
        className="w-full cursor-pointer"
      >
        Add
      </Button>
    </div>
  );
}

export { AddModelPopup };
