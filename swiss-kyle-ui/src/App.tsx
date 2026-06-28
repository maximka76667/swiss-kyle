import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SidebarProvider, SidebarInset, Sidebar } from '@/components/ui/sidebar'
import { ToolNav } from '@/components/tool-nav'
import { JobHistory } from '@/components/job-history'
import { CutVideo } from '@/components/cut-video'
import { WordToPdf } from '@/components/word-to-pdf'
import { FloatingSidebarTrigger } from '@/components/floating-sidebar-trigger'
import type { JobStatusEvent, Tool, TrackedJob } from '@/types/jobs'

const TOOL_LABELS: Record<Tool, string> = {
  'cut-video': 'Cut Video',
  'word-to-pdf': 'Word to PDF',
}

function App() {
  const [tool, setTool] = useState<Tool>('cut-video')
  const [jobs, setJobs] = useState<TrackedJob[]>([])

  useEffect(() => {
    const unlisten = listen<JobStatusEvent>('job-status', (event) => {
      setJobs((prev) =>
        prev.map((job) =>
          job.id === event.payload.id
            ? { ...job, status: event.payload.status }
            : job,
        ),
      )
    })
    return () => { unlisten.then((f) => f()) }
  }, [])

  function handleJobSubmitted(id: string, input: string, output: string) {
    setJobs((prev) => [
      ...prev,
      { id, tool, input, output, status: 'Submitted', submittedAt: new Date() },
    ])
  }

  function handleRemoveJob(id: string) {
    setJobs((prev) => prev.filter((job) => job.id !== id))
  }

  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen style={{ '--sidebar-width': '200px' } as React.CSSProperties}>
        <ToolNav selectedTool={tool} onSelectTool={setTool} />
        <SidebarInset>
          <SidebarProvider style={{ '--sidebar-width': '480px' } as React.CSSProperties}>
            <SidebarInset>
              <header className="flex h-12 shrink-0 items-center border-b px-4">
                <span className="text-sm font-medium">{TOOL_LABELS[tool]}</span>
              </header>
              {tool === 'cut-video' && (
                <CutVideo onJobSubmitted={handleJobSubmitted} />
              )}
              {tool === 'word-to-pdf' && (
                <WordToPdf onJobSubmitted={handleJobSubmitted} />
              )}
            </SidebarInset>
            <Sidebar side="right" collapsible="offcanvas">
              <JobHistory jobs={jobs} onRemove={handleRemoveJob} />
            </Sidebar>
            <FloatingSidebarTrigger />
          </SidebarProvider>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}

export default App
