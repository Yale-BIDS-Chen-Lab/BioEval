import { Container } from "@/components/create-inference/container";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_authed/dashboard/project/$projectId/inference/create",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { projectId } = Route.useParams();
  return (
    <div className="min-h-full w-full overflow-hidden bg-zinc-50 dark:bg-zinc-950/30">
      <Container projectId={projectId} />
    </div>
  );
}
