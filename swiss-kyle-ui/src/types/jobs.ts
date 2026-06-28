export type Tool = 'cut-video' | 'word-to-pdf'

export type JobStatus =
  | 'Received'
  | { Processing: { percent: number } }
  | 'Done'
  | { Failed: { reason: string } }

export type JobStatusEvent = {
  id: string
  status: JobStatus
}

export type TrackedJobStatus = JobStatus | 'Submitted'

export type TrackedJob = {
  id: string
  tool: Tool
  input: string
  output: string
  status: TrackedJobStatus
  submittedAt: Date
}
