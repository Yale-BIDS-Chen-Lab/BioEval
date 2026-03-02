import { InferenceList } from "@/components/project/inference-list";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/dashboard/project/$projectId/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950/30">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4">
          <h1 className="mb-2 text-2xl font-semibold tracking-tight">My Inferences</h1>
          <InferenceList />
        </div>
      </div>
    </div>
  );
}
