import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/navbar/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Box, Database, Plug } from "lucide-react";
import { Toaster } from "sonner";

export const Route = createFileRoute("/_authed/dashboard")({
  component: RouteComponent,
  staticData: {
    sidebarItems: [
      { title: "Projects", url: "/dashboard/project", icon: Box },
      { title: "Datasets", url: "/dashboard/dataset", icon: Database },
      { title: "Integrations", url: "/dashboard/settings", icon: Plug },
    ],
  },
});

function RouteComponent() {
  return (
    <>
      <SidebarProvider
        className="flex h-full flex-col [--header-height:calc(theme(spacing.14))]"
        defaultOpen={true}
      >
        <SiteHeader />
        <div className="flex min-h-0 flex-1">
          <AppSidebar collapsible="none" />
          <SidebarInset className="min-w-0 flex-1">
            <Outlet />
          </SidebarInset>
          {/* <div className="flex h-full w-full flex-1 overflow-hidden overflow-x-auto overflow-y-auto">
              <Outlet />
            </div> */}
        </div>
        <Toaster />
      </SidebarProvider>
    </>
  );
}
