import { Container } from "@/components/create-project/container";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/dashboard/project/create")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950/30">
      <Container />
    </div>
  );
}
