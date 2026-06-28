import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Sidebar, SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { JobHistory } from '@/components/job-history'
import { CutVideo } from '@/components/cut-video'
import { FloatingSidebarTrigger } from '@/components/floating-sidebar-trigger'
import type { JobStatusEvent, TrackedJob } from '@/types/jobs'

function App() {
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
    return () => {
      unlisten.then((f) => f())
    }
  }, [])

  function handleJobSubmitted(id: string, input: string, output: string) {
    setJobs((prev) => [...prev, { id, input, output, status: 'Submitted', submittedAt: new Date() }])
  }

  function handleRemoveJob(id: string) {
    setJobs((prev) => prev.filter((job) => job.id !== id))
  }

  return (
    <TooltipProvider>
      <SidebarProvider style={{ '--sidebar-width': '480px' } as React.CSSProperties}>
        <SidebarInset>
          <header className="flex h-12 shrink-0 items-center border-b px-4">
            <span className="text-sm font-medium">Cut Video</span>
          </header>
          <CutVideo onJobSubmitted={handleJobSubmitted} />
        </SidebarInset>
        <Sidebar side="right" collapsible="offcanvas">
          <JobHistory jobs={jobs} onRemove={handleRemoveJob} />
        </Sidebar>
        <FloatingSidebarTrigger />
      </SidebarProvider>
    </TooltipProvider>
  )
}

export default App
