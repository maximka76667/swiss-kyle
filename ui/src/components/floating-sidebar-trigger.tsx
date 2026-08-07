import { PanelRightOpen } from "lucide-react";
import { Button } from "@shadcn/components/ui/button";
import { useSidebar } from "@shadcn/components/ui/sidebar";

export function FloatingSidebarTrigger() {
  const { open, toggleSidebar } = useSidebar();
  if (open) return null;
  return (
    <Button
      variant="outline"
      size="icon"
      className="fixed top-3 right-3 rounded-full shadow-lg"
      onClick={toggleSidebar}
    >
      <PanelRightOpen className="h-4 w-4" />
    </Button>
  );
}
