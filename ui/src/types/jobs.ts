export type Tool = 'cut-video' | 'doc-converter' | 'merge-pdfs'

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

export type LogLevel = 'Info' | 'Warn' | 'Error'

export type LogEntry = {
  job_id: string
  job_type: string
  level: LogLevel
  message: string
  timestamp: string
}

export type WorkerState =
  | 'Idle'
  | { Busy: { job_id: string } }
  | { Error: { reason: string } }

export type WorkerHeartbeat = {
  worker_id: number
  state: WorkerState
  timestamp: string
}
