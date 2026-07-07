import { useEffect, useRef, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  SidebarProvider,
  SidebarInset,
  Sidebar,
} from "@/components/ui/sidebar";
import { ToolNav } from "@/components/tool-nav";
import { JobHistory } from "@/components/job-history";
import { CutVideo } from "@/components/cut-video";
import { DocConverter } from "@/components/doc-converter";
import { MergePdfs } from "@/components/merge-pdfs";
import { FloatingSidebarTrigger } from "@/components/floating-sidebar-trigger";
import { Toaster } from "@/components/ui/sonner";
import type { JobStatus, JobStatusEvent, Tool, TrackedJob } from "@/types/jobs";

function App() {
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
              <Routes>
                <Route
                  path="/cut-video"
                  element={<CutVideo onJobSubmitted={handleJobSubmitted} />}
                />
                <Route
                  path="/doc-converter"
                  element={<DocConverter onJobSubmitted={handleJobSubmitted} />}
                />
                <Route
                  path="/merge-pdfs"
                  element={<MergePdfs onJobSubmitted={handleJobSubmitted} />}
                />
              </Routes>
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
