import { createFileRoute, redirect } from "@tanstack/react-router";

// TODO: this is not the best solution (technically dependent on what the end URL structure will be)
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({
      to: "/dashboard/project",
    });
  },
  component: App,
});

function App() {
  return <></>;
}
