import type { ReactNode } from "react";
import { axios } from "@/lib/axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronRight, Plug, CheckCircle2 } from "lucide-react";
import {
  useForm,
  type FieldErrors,
  type RegisterOptions,
  type SubmitHandler,
} from "react-hook-form";

export const Route = createFileRoute("/_authed/dashboard/settings")({
  component: SettingsPage,
});

type JSONSchema = {
  type: "object";
  properties: Record<
    string,
    { type: "string"; minLength?: number; format?: string }
  >;
  required?: string[];
};

type Integration = {
  providerId: string;
  providerName: string;
  schema: JSONSchema;
  settings: Record<string, unknown> | null;
};

function formatFieldLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .trim()
    .toUpperCase();
}

function isSecretField(key: string): boolean {
  const lower = key.toLowerCase();
  return lower.includes("key") || lower.includes("secret") || lower.includes("token") || lower.includes("password");
}

function SettingsPage() {
  const {
    data: integrations = [],
    isPending,
    isError,
  } = useQuery({
    queryKey: ["integrations"],
    queryFn: () =>
      axios
        .get<{ success: boolean; integrations: Integration[] }>(
          "api/integration/list",
          { withCredentials: true }
        )
        .then((res: { data: { integrations: Integration[] } }) => res.data.integrations),
  });

  const qc = useQueryClient();
  const saveMutation = useMutation({
    mutationKey: ["integration", "update"],
    mutationFn: (payload: { providerId: string; settings: unknown }) =>
      axios.post("api/integration/update", payload, { withCredentials: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations"] }),
  });

  const wrapper = (children: ReactNode) => (
    <main className="min-h-full bg-zinc-50 dark:bg-zinc-950/30 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">{children}</div>
    </main>
  );

  if (isPending)
    return wrapper(
      <p className="text-muted-foreground text-sm">Loading integrations...</p>
    );

  if (isError)
    return wrapper(
      <p className="text-destructive text-sm">
        Failed to load integrations. Please refresh the page.
      </p>
    );

  return wrapper(
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-background shadow-sm">
          <Plug className="h-5 w-5 text-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect your AI provider credentials to enable model inference.
          </p>
        </div>
      </div>

      {/* Integration list */}
      <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
        {integrations.map((integration: Integration, idx: number) => (
          <IntegrationRow
            key={integration.providerId}
            integration={integration}
            isLast={idx === integrations.length - 1}
            onSave={(settings) =>
              saveMutation.mutate({
                providerId: integration.providerId,
                settings,
              })
            }
            isSaving={
              saveMutation.isPending &&
              saveMutation.variables?.providerId === integration.providerId
            }
          />
        ))}
      </div>
    </div>
  );
}

function IntegrationRow({
  integration,
  isLast,
  onSave,
  isSaving,
}: {
  integration: Integration;
  isLast: boolean;
  onSave: (settings: Record<string, unknown>) => void;
  isSaving: boolean;
}) {
  const isConfigured = !!integration.settings;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          className={`group flex w-full items-center gap-5 px-6 py-5 text-left transition-colors hover:bg-muted/40 ${
            !isLast ? "border-b" : ""
          }`}
        >
          {/* Logo */}
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border bg-muted/30">
            <img
              src={`/logos/${integration.providerId}.svg`}
              alt={`${integration.providerName} logo`}
              className="h-6 w-6"
            />
          </div>

          {/* Name + description */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{integration.providerName}</span>
              {isConfigured ? (
                <Badge
                  variant="outline"
                  className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  Connected
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-muted-foreground/20 text-muted-foreground"
                >
                  Not configured
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isConfigured
                ? "Credentials saved. Click to update."
                : "Click to add your API credentials."}
            </p>
          </div>

          {/* Arrow */}
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </button>
      </DialogTrigger>

      <ConfigureDialog
        integration={integration}
        onSave={onSave}
        isSaving={isSaving}
      />
    </Dialog>
  );
}

function ConfigureDialog({
  integration,
  onSave,
  isSaving,
}: {
  integration: Integration;
  onSave: (settings: Record<string, unknown>) => void;
  isSaving: boolean;
}) {
  type Inputs = Record<string, string>;

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<Inputs>({
    defaultValues: integration.settings as Inputs | undefined,
  });

  const submit: SubmitHandler<Inputs> = (data) => {
    onSave(data);
    reset(data);
  };

  const fields = Object.keys(integration.schema.properties);

  function toRHFValidation(key: string): RegisterOptions {
    const field = integration.schema.properties[key];
    const required = integration.schema.required?.includes(key);
    const rules: RegisterOptions = {};
    if (required) rules.required = "This field is required.";
    if (field.minLength)
      rules.minLength = {
        value: field.minLength,
        message: `Minimum ${field.minLength} characters.`,
      };
    return rules;
  }

  return (
    <DialogContent className="sm:max-w-md p-6">
      <DialogHeader className="flex-row items-center gap-3 space-y-0 pb-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
          <img
            src={`/logos/${integration.providerId}.svg`}
            alt={integration.providerName}
            className="h-5 w-5"
          />
        </div>
        <div>
          <DialogTitle className="text-base">
            Configure {integration.providerName}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Your credentials are stored securely and never shared.
          </p>
        </div>
      </DialogHeader>

      <form
        id={`form-${integration.providerId}`}
        onSubmit={handleSubmit(submit)}
        className="space-y-3 pt-1"
      >
        {fields.map((key) => (
          <div key={key} className="space-y-1">
            <Label htmlFor={key} className="text-sm font-medium">
              {formatFieldLabel(key)}
              {integration.schema.required?.includes(key) && (
                <span className="ml-1 text-muted-foreground font-normal">(required)</span>
              )}
            </Label>
            <Input
              id={key}
              type={isSecretField(key) ? "password" : "text"}
              placeholder={key.replace(/([A-Z])/g, " $1").trim().toLowerCase()}
              className="font-mono text-sm"
              {...register(key, toRHFValidation(key))}
            />
            {errors[key] && (
              <p className="text-xs text-destructive">
                {(errors[key] as FieldErrors)["message"]?.toString()}
              </p>
            )}
          </div>
        ))}
      </form>

      <DialogFooter className="pt-1">
        <Button
          type="submit"
          form={`form-${integration.providerId}`}
          disabled={isSaving}
          className="w-full sm:w-auto"
        >
          {isSaving ? "Saving..." : "Save credentials"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
