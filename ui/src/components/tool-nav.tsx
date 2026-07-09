import { useNavigate, useLocation } from "react-router-dom";
import { Scissors, ArrowLeftRight, Combine, Activity } from "lucide-react";
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
} from "@/components/ui/sidebar";

const TOOLS: { path: string; label: string; icon: React.ElementType }[] = [
  { path: "/cut-video", label: "Cut Video", icon: Scissors },
  { path: "/doc-converter", label: "Doc Converter", icon: ArrowLeftRight },
  { path: "/merge-pdfs", label: "Merge PDFs", icon: Combine },
];

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
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
