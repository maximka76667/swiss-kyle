export type Tool = "edit-video" | "doc-converter" | "merge-pdfs";

// A constructor, not a plain object type, so rounding is enforced wherever a
// CropRect is built rather than relying on every call site to remember it:
// this crosses the Tauri IPC boundary into a Rust struct with u32 fields,
// and a stray float (routine in the crop-overlay drag math, which divides
// by a CSS/native-pixel scale factor) makes serde reject the whole
// invoke() call with "invalid type: floating point ..., expected u32".
export class CropRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;

  constructor(x: number, y: number, width: number, height: number) {
    this.x = Math.round(x);
    this.y = Math.round(y);
    this.width = Math.round(width);
    this.height = Math.round(height);
  }
}

export type JobStatus =
  | "Received"
  | { Processing: { percent: number } }
  | "Done"
  | { Failed: { reason: string } };

export type JobStatusEvent = {
  id: string;
  status: JobStatus;
};

export type TrackedJobStatus = JobStatus | "Submitted";

export type TrackedJob = {
  id: string;
  tool: Tool;
  input: string;
  output: string;
  status: TrackedJobStatus;
  submittedAt: Date;
};

export type LogLevel = "Info" | "Warn" | "Error";

export type LogEntry = {
  job_id: string;
  job_type: string;
  level: LogLevel;
  message: string;
  timestamp: string;
};

export type WorkerState =
  "Idle" | { Busy: { job_id: string } } | { Error: { reason: string } };

export type WorkerHeartbeat = {
  worker_id: number;
  state: WorkerState;
  timestamp: string;
};
