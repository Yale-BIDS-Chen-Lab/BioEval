import { ProjectsList } from "@/components/project-list";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { axios } from "@/lib/axios";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FolderOpen, LoaderCircle, Plus } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_authed/dashboard/project/")({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      axios.post("api/project/create", { name }, { withCredentials: true }),
    onSuccess: () => {
      setOpen(false);
      setName("");
      navigate({ to: "/dashboard/project", reloadDocument: true });
    },
  });

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950/30">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">

        {/* Page header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-background shadow-sm">
              <FolderOpen className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
              <p className="text-sm text-muted-foreground">Organise and track your LLM benchmarking runs.</p>
            </div>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                New project
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm p-6">
              <p className="mb-1 text-base font-semibold">New project</p>
              <p className="mb-4 text-sm text-muted-foreground">Give your project a name to get started.</p>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. Clinical NER benchmark"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && name && mutation.mutate()}
                  className="flex-1"
                  autoFocus
                />
                <Button
                  disabled={!name.trim() || mutation.isPending}
                  onClick={() => mutation.mutate()}
                >
                  {mutation.isPending ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    "Create"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <ProjectsList />
      </div>
    </div>
  );
}
