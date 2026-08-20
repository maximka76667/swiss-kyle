import { useEffect, useRef, useState } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import { TooltipProvider } from "@shadcn/components/ui/tooltip";
import {
  SidebarProvider,
  SidebarInset,
  Sidebar,
} from "@shadcn/components/ui/sidebar";
import { ToolNav } from "@/components/tool-nav";
import { ErrorBoundary } from "@/components/error-boundary";
import { JobHistory } from "@/features/job-history/components/job-history";
import { DiagnosticsPage } from "@/features/diagnostics-page/components/diagnostics-page";
import { TOOLS } from "@/lib/tools";
import { FloatingSidebarTrigger } from "@/components/floating-sidebar-trigger";
import { Toaster } from "@shadcn/components/ui/sonner";
import type { JobStatus, JobStatusEvent, Tool, TrackedJob } from "@/types/jobs";

function App() {
  const location = useLocation();
  const [jobs, setJobs] = useState<TrackedJob[]>([]);
  const pendingEvents = useRef<Map<string, JobStatus>>(new Map());

  useEffect(() => {
    const unlisten = listen<JobStatusEvent>("job-status", (event) => {
      setJobs((prev) => {
        if (!prev.find((j) => j.id === event.payload.id)) {
          // Job not registered yet — buffer the event
          pendingEvents.current.set(event.payload.id, event.payload.status);
          return prev;
        }
        return prev.map((job) =>
          job.id === event.payload.id
            ? { ...job, status: event.payload.status }
            : job,
        );
      });
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  function handleJobSubmitted(
    id: string,
    tool: Tool,
    input: string,
    output: string,
  ) {
    const buffered = pendingEvents.current.get(id);
    pendingEvents.current.delete(id);
    setJobs((prev) => [
      ...prev,
      {
        id,
        tool,
        input,
        output,
        status: buffered ?? "Submitted",
        submittedAt: new Date(),
      },
    ]);
  }

  function handleRemoveJob(id: string) {
    setJobs((prev) => prev.filter((job) => job.id !== id));
  }

  return (
    <TooltipProvider>
      <Toaster position="bottom-right" />
      <SidebarProvider
        defaultOpen={false}
        style={{ "--sidebar-width": "200px" } as React.CSSProperties}
      >
        <ToolNav />
        <SidebarInset>
          <SidebarProvider
            style={{ "--sidebar-width": "480px" } as React.CSSProperties}
          >
            <SidebarInset>
              <ErrorBoundary key={location.pathname}>
                <Routes>
                  {TOOLS.map(({ path, component: Component }) => (
                    <Route
                      key={path}
                      path={path}
                      element={<Component onJobSubmitted={handleJobSubmitted} />}
                    />
                  ))}
                  <Route path="/diagnostics" element={<DiagnosticsPage />} />
                </Routes>
              </ErrorBoundary>
            </SidebarInset>
            <Sidebar side="right" collapsible="offcanvas">
              <JobHistory jobs={jobs} onRemove={handleRemoveJob} />
            </Sidebar>
            <FloatingSidebarTrigger />
          </SidebarProvider>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

export default App;
