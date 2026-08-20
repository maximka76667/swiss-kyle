import { useNavigate, useLocation } from "react-router-dom";
import { Activity } from "lucide-react";
import { TOOLS } from "@/lib/tools";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
} from "@shadcn/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";

const OTHER: { path: string; label: string; icon: React.ElementType }[] = [
  { path: "/diagnostics", label: "Diagnostics", icon: Activity },
];

export function ToolNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarTrigger />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {TOOLS.map(({ path, label, icon: Icon }) => (
                <SidebarMenuItem key={path}>
                  <SidebarMenuButton
                    isActive={pathname === path}
                    tooltip={label}
                    onClick={() => navigate(path)}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          {OTHER.map(({ path, label, icon: Icon }) => (
            <SidebarMenuItem key={path}>
              <SidebarMenuButton
                isActive={pathname === path}
                tooltip={label}
                onClick={() => navigate(path)}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
          <ThemeToggle />
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
