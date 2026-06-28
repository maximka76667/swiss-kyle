import { Scissors, FileText } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import type { Tool } from '@/types/jobs'

const TOOLS: { id: Tool; label: string; icon: React.ElementType }[] = [
  { id: 'cut-video', label: 'Cut Video', icon: Scissors },
  { id: 'word-to-pdf', label: 'Word to PDF', icon: FileText },
]

interface Props {
  selectedTool: Tool
  onSelectTool: (tool: Tool) => void
}

export function ToolNav({ selectedTool, onSelectTool }: Props) {
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
              {TOOLS.map(({ id, label, icon: Icon }) => (
                <SidebarMenuItem key={id}>
                  <SidebarMenuButton
                    isActive={selectedTool === id}
                    tooltip={label}
                    onClick={() => onSelectTool(id)}
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
    </Sidebar>
  )
}
