import { OFFLINE_AFTER_MS, WORKER_COUNT } from "@/features/diagnostics-page/constants/diagnostics";
import type {
  WorkerRow,
  WorkerRowDisplay,
} from "@/features/diagnostics-page/lib/types";

export function initialWorkerRows(): Map<number, WorkerRow> {
  const rows = new Map<number, WorkerRow>();
  for (let i = 0; i < WORKER_COUNT; i++) {
    rows.set(i, {
      workerId: i,
      state: "Unknown",
      timestamp: null,
      lastSeen: null,
    });
  }
  return rows;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Derives a worker row's status label/dot color from its state and staleness. */
export function workerRowDisplay(
  worker: WorkerRow,
  now: number,
): WorkerRowDisplay {
  const unknown = worker.state === "Unknown";
  const offline =
    !unknown && now - (worker.lastSeen as number) > OFFLINE_AFTER_MS;
  const isError = typeof worker.state === "object" && "Error" in worker.state;

  if (unknown) {
    return {
      label: "waiting for status…",
      dotColor: "",
      unknown,
      offline,
      isError,
    };
  }
  if (offline) {
    return {
      label: "offline",
      dotColor: "bg-muted-foreground/40",
      unknown,
      offline,
      isError,
    };
  }
  if (isError) {
    const reason = (worker.state as { Error: { reason: string } }).Error
      .reason;
    return {
      label: `broken — ${reason}`,
      dotColor: "bg-red-500",
      unknown,
      offline,
      isError,
    };
  }
  if (worker.state === "Idle") {
    return {
      label: "idle",
      dotColor: "bg-emerald-500",
      unknown,
      offline,
      isError,
    };
  }
  const jobId = (worker.state as { Busy: { job_id: string } }).Busy.job_id;
  return {
    label: `busy — job ${jobId.slice(0, 8)}`,
    dotColor: "bg-amber-500",
    unknown,
    offline,
    isError,
  };
}
