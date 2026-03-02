import { ThemeProvider } from "@/components/theme-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, createRootRoute } from "@tanstack/react-router";

const queryClient = new QueryClient();

export const Route = createRootRoute({
  component: () => (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <div className="h-screen w-screen overflow-x-hidden">
          <Outlet />
        </div>
        {/* <TanStackRouterDevtools /> */}
      </ThemeProvider>
    </QueryClientProvider>
  ),
});
