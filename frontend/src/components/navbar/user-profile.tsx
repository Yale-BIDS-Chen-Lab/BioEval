import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth";
import { useNavigate } from "@tanstack/react-router";
import { useTheme, type Theme } from "@/components/theme-provider";
import { Check } from "lucide-react";
import { useMemo } from "react";

function getAvatarUrl(email: string | undefined): string {
  if (!email) return "";
  const seed = encodeURIComponent(email.toLowerCase().trim());
  return `https://api.dicebear.com/9.x/initials/svg?seed=${seed}&backgroundColor=94a3b8,64748b`;
}

function UserProfile() {
  const { setTheme, theme } = useTheme();
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();

  const avatarUrl = useMemo(
    () => getAvatarUrl(session?.user.email),
    [session?.user.email]
  );

  const signOut = async () => {
    const goToLogin = () => navigate({ to: "/login" });
    try {
      await authClient.signOut({
        callbackURL: typeof window !== "undefined" ? `${window.location.origin}/login` : "/login",
        fetchOptions: {
          onSuccess: goToLogin,
        },
      });
    } catch {
      goToLogin();
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="outline-none">
          <Avatar className="cursor-pointer select-none">
            <AvatarImage src={avatarUrl} />
            <AvatarFallback>
              {session?.user.email?.[0]?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>

          <DropdownMenuContent className="w-56 select-none p-1" align="end">
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground px-2 py-1.5">
            Account
          </DropdownMenuLabel>
          <div className="px-2 py-1.5 text-sm text-muted-foreground truncate">
            {session?.user.email}
          </div>

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground px-2 py-1.5">
            Theme
          </DropdownMenuLabel>
          {["light", "dark", "system"].map((t) => (
            <DropdownMenuItem
              key={t}
              onClick={() => setTheme(t as Theme)}
              className="cursor-pointer"
            >
              {theme === t && <Check className="h-4 w-4" />}
              {theme !== t && <span className="mr-4" />}{" "}
              {t[0].toUpperCase() + t.slice(1)}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuItem className="cursor-pointer" onClick={signOut}>
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

export { UserProfile };
