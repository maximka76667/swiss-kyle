import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        tooltip={isDark ? "Switch to light mode" : "Switch to dark mode"}
        onClick={() => setTheme(isDark ? "light" : "dark")}
      >
        {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        <span>{isDark ? "Dark" : "Light"}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
