import * as React from "react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  useLocation,
  useMatches,
  type AnyRouteMatch
} from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

type SidebarItem = {
  title: string;
  url: string;
  icon: LucideIcon;
};

type SidebarItems = SidebarItem[] | ((match: AnyRouteMatch) => SidebarItem[]);

type StaticData = {
  sidebarItems?: SidebarItems;
  sidebarDisabled?: boolean;
};

type SidebarConfig = { disabled: true } | { items: SidebarItem[] } | {};

function resolveItems(spec: SidebarItems, match: AnyRouteMatch): SidebarItem[] {
  return typeof spec === "function" ? spec(match) : spec;
}

function useSidebarConfig(): SidebarConfig {
  const matches = useMatches();

  for (let i = matches.length - 1; i >= 0; i--) {
    const data = matches[i].staticData as StaticData | undefined;
    if (!data) continue;

    if (data.sidebarDisabled) return { disabled: true };

    if (data.sidebarItems) {
      return { items: resolveItems(data.sidebarItems, matches[i]) };
    }
  }
  return {};
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation();
  const config = useSidebarConfig();

  if ("disabled" in config) return null;
  if (!("items" in config) || !config.items.length) return null;

  const { items } = config;

  return (
    <Sidebar
      className="top-(--header-height) h-[calc(100svh-var(--header-height))]!"
      {...props}
    >
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {items.map((item) => (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton
                  asChild
                  tooltip={item.title}
                  isActive={location.pathname.startsWith(item.url)}
                  size="lg"
                >
                  <a href={item.url}>
                    <item.icon className="size-5 shrink-0" />
                    <span className="text-sm font-medium">{item.title}</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter></SidebarFooter>
    </Sidebar>
  );
}
