import { Button } from "@/components/ui/button";
import { axios } from "@/lib/axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { FolderOpen, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { toast } from "sonner";

const PROJECT_COLORS = [
  "bg-blue-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-cyan-500",
  "bg-amber-500",
  "bg-rose-500",
];

function getProjectColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return PROJECT_COLORS[Math.abs(hash) % PROJECT_COLORS.length];
}

function ProjectsList() {
  const navigate = useNavigate();
  const { isPending, isError, data } = useQuery({
    queryKey: ["projects"],
    queryFn: () => axios.get("api/project/list", { withCredentials: true }),
  });

  if (isPending) return (
    <p className="text-sm text-muted-foreground">Loading projects...</p>
  );

  if (isError) return (
    <p className="text-sm text-destructive">Failed to load projects. Please refresh.</p>
  );

  const projects = data.data.projects;

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/20 bg-muted/10 py-20 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <FolderOpen className="h-7 w-7 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">No projects yet</p>
        <p className="mt-1 text-sm text-muted-foreground">Create a project to start benchmarking your models.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {projects.map((project: any) => (
        <ProjectCard
          key={project.projectId}
          project={project}
          onOpen={() =>
            navigate({
              to: "/dashboard/project/$projectId",
              // @ts-ignore
              params: { projectId: project.projectId },
            })
          }
        />
      ))}
    </div>
  );
}

function ProjectCard({ project, onOpen }: { project: any; onOpen: () => void }) {
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [newName, setNewName] = useState(project.name);
  const queryClient = useQueryClient();

  const colorClass = getProjectColor(project.name);
  const maxVisible = 3;
  const logos: string[] = project.providers ?? [];
  const visible = logos.slice(0, maxVisible);
  const remaining = logos.length - maxVisible;

  const renameMutation = useMutation({
    mutationFn: (name: string) =>
      axios.post("api/project/rename", { projectId: project.projectId, name }, { withCredentials: true }),
    onSuccess: () => {
      toast.success("Project renamed");
      setShowRenameDialog(false);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (error: any) => toast.error(error.response?.data?.error || "Failed to rename project"),
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      axios.post("api/project/delete", { projectId: project.projectId }, { withCredentials: true }),
    onSuccess: () => {
      toast.success("Project deleted");
      setShowDeleteDialog(false);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (error: any) => toast.error(error.response?.data?.error || "Failed to delete project"),
  });

  return (
    <>
      <div
        className="group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-background shadow-sm transition-all hover:shadow-md hover:border-primary/40 select-none"
        onClick={onOpen}
      >
        {/* Colored top strip */}
        <div className={`h-1.5 w-full ${colorClass}`} />

        <div className="flex flex-1 flex-col gap-4 p-5">
          {/* Project initial + name */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white text-sm font-bold ${colorClass}`}>
                {project.name.charAt(0).toUpperCase()}
              </div>
              <p className="text-sm font-semibold leading-snug line-clamp-2">{project.name}</p>
            </div>

            {/* ··· menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); setNewName(project.name); setShowRenameDialog(true); }}
                >
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer text-destructive focus:text-destructive"
                  onClick={(e) => { e.stopPropagation(); setShowDeleteDialog(true); }}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Provider logos */}
          {logos.length > 0 && (
            <div className="mt-auto flex -space-x-2">
              {visible.map((provider, i) => (
                <Avatar key={i} className="size-7 border-2 border-background bg-muted">
                  <AvatarImage src={`/logos/${provider}.svg`} className="object-contain p-1" />
                  <AvatarFallback />
                </Avatar>
              ))}
              {remaining > 0 && (
                <div className="flex size-7 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-semibold text-muted-foreground">
                  +{remaining}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Rename dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent className="max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="rename-input">Project name</Label>
            <Input
              id="rename-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && newName.trim() && renameMutation.mutate(newName)}
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowRenameDialog(false)}>Cancel</Button>
            <Button
              onClick={() => renameMutation.mutate(newName)}
              disabled={renameMutation.isPending || !newName.trim()}
            >
              {renameMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
          <DialogHeader className="space-y-2">
            <DialogTitle>Delete project?</DialogTitle>
            <DialogDescription>
              This will permanently delete <span className="font-medium text-foreground">"{project.name}"</span> and all its inferences, evaluations, and notes. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-2 gap-2">
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export { ProjectsList };
