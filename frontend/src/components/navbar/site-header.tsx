import { SidebarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useSidebar } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { Link } from "@tanstack/react-router";
import { UserProfile } from "./user-profile";

const logoStyle: React.CSSProperties = {
  fontFamily: "'Space Grotesk', sans-serif",
  fontWeight: 700,
};

function BioEvalLogo() {
  return (
    <Link to="/dashboard" className="select-none text-xl tracking-tight" style={logoStyle}>
      Bio<span className="text-muted-foreground">Eval</span>
    </Link>
  );
}

function SiteHeaderBase() {
  return (
    <header className="bg-background sticky top-0 z-50 flex w-full items-center border-b">
      <div className="flex h-(--header-height) w-full items-center gap-2 px-4">
        <BioEvalLogo />
        <div className="ml-auto flex flex-row gap-4">
          <UserProfile />
        </div>
      </div>
    </header>
  );
}

function SiteHeaderWithToggle() {
  const { toggleSidebar } = useSidebar();
  const isMobile = useIsMobile();

  const sidebarToggle = isMobile && (
    <>
      <Button
        className="h-8 w-8"
        variant="ghost"
        size="icon"
        onClick={toggleSidebar}
      >
        <SidebarIcon />
      </Button>
      <Separator orientation="vertical" className="mr-2 h-4!" />
    </>
  );

  return (
    <header className="bg-background sticky top-0 z-50 flex w-full items-center border-b">
      <div className="flex h-(--header-height) w-full items-center gap-2 px-4">
        {sidebarToggle}
        <BioEvalLogo />
        <div className="ml-auto flex flex-row gap-4">
          <UserProfile />
        </div>
      </div>
    </header>
  );
}

export function SiteHeader({
  enableToggle = false,
}: {
  enableToggle?: boolean;
}) {
  return enableToggle ? <SiteHeaderWithToggle /> : <SiteHeaderBase />;
}
