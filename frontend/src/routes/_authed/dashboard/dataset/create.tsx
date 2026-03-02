import { Container } from "@/components/create-dataset/container";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/dashboard/dataset/create")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="min-h-full w-full overflow-hidden bg-zinc-50 dark:bg-zinc-950/30">
      <Container />
    </div>
  );
}
