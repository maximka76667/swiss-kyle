import { FolderOpen, Scissors, FileText, X } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import type { Tool, TrackedJob, TrackedJobStatus } from '@/types/jobs'

const TOOL_ICONS: Record<Tool, React.ElementType> = {
  'cut-video': Scissors,
  'word-to-pdf': FileText,
}

function statusBadgeVariant(
  status: TrackedJobStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'Done') return 'default'
  if (typeof status === 'object' && 'Failed' in status) return 'destructive'
  return 'secondary'
}

function statusLabel(status: TrackedJobStatus): string {
  if (status === 'Submitted') return 'Submitted'
  if (status === 'Received') return 'Received'
  if (status === 'Done') return 'Done'
  if (typeof status === 'object' && 'Processing' in status)
    return `${status.Processing.percent.toFixed(0)}%`
  if (typeof status === 'object' && 'Failed' in status) return 'Failed'
  return 'Unknown'
}

function processingPercent(status: TrackedJobStatus): number | null {
  if (typeof status === 'object' && 'Processing' in status)
    return status.Processing.percent
  return null
}

function failureReason(status: TrackedJobStatus): string | null {
  if (typeof status === 'object' && 'Failed' in status)
    return status.Failed.reason
  return null
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

function formatDate(date: Date): string {
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function JobHistory({ jobs, onRemove }: { jobs: TrackedJob[]; onRemove: (id: string) => void }) {
  const { toggleSidebar } = useSidebar()
  const reversed = [...jobs].reverse()

  return (
    <>
      <SidebarHeader className="flex flex-row items-center justify-between">
        <span className="px-2 text-sm font-semibold">Jobs</span>
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon-sm"
            title="Open output folder"
            onClick={() => invoke('open_output_folder')}
          >
            <FolderOpen className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={toggleSidebar}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            {jobs.length === 0 ? (
              <p className="px-4 py-3 text-xs text-muted-foreground">No jobs yet</p>
            ) : (
              <SidebarMenu>
                {reversed.map((job, i) => {
                  const percent = processingPercent(job.status)
                  const reason = failureReason(job.status)
                  return (
                    <SidebarMenuItem key={job.id}>
                      {i > 0 && <Separator />}
                      <div className="flex flex-col gap-1.5 px-3 py-2.5">
                        <div className="flex items-start gap-2">
                          {(() => { const Icon = TOOL_ICONS[job.tool]; return <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" /> })()}
                          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="truncate text-sm font-medium">{job.output}</span>
                            <span className="truncate text-xs text-muted-foreground" title={job.input}>
                              Source file: {job.input}
                            </span>
                            <span className="text-xs text-muted-foreground">{formatDate(job.submittedAt)}</span>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <Badge variant={statusBadgeVariant(job.status)} className="text-xs">
                              {statusLabel(job.status)}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-muted-foreground hover:text-foreground"
                              onClick={() => onRemove(job.id)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        {percent !== null && <Progress value={percent} className="h-1" />}
                        {reason !== null && (
                          <p className="text-xs text-destructive break-words">{reason}</p>
                        )}
                      </div>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </>
  )
}
