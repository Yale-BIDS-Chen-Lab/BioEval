import { createFileRoute, Outlet, type AnyRouteMatch } from "@tanstack/react-router";
import { Bot } from "lucide-react";

export const Route = createFileRoute("/_authed/dashboard/project/$projectId")({
  component: RouteComponent,
  staticData: {
    sidebarItems: (match: AnyRouteMatch) => [
      {
        title: "Inferences",
        url: `/dashboard/project/${match.params.projectId}`,
        icon: Bot,
      },
    ],
  },
});

function RouteComponent() {
  return <Outlet />;
}
