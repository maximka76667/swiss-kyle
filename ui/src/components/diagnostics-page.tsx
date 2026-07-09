import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { LogEntry, WorkerHeartbeat } from "@/types/jobs";
import { cn } from "@/lib/utils";

// 3x the worker's 5s heartbeat publish interval (crates/worker/src/main.rs
// WORKER_HEARTBEAT_INTERVAL) — a worker that misses this many ticks in a row
// is treated as offline rather than merely between beats.
const OFFLINE_AFTER_MS = 15_000;

// Matches the backend's worker-count cap (src-tauri/src/lib.rs: cores
// capped at 4). Placeholder rows are seeded for all 4 up front so the list
// renders at its final size immediately instead of growing (and jumping
// the layout) as heartbeats trickle in — a machine with fewer cores just
// leaves the extra rows on "waiting for status" indefinitely.
const WORKER_COUNT = 4;

type WorkerRow = {
  workerId: number;
  // "Unknown" = no heartbeat received yet this session.
  state: WorkerHeartbeat["state"] | "Unknown";
  timestamp: string | null;
  lastSeen: number | null;
};

function initialWorkerRows(): Map<number, WorkerRow> {
  const rows = new Map<number, WorkerRow>();
  for (let i = 0; i < WORKER_COUNT; i++) {
    rows.set(i, { workerId: i, state: "Unknown", timestamp: null, lastSeen: null });
  }
  return rows;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// Terminal-style coloring: dim gray metadata, level-tinted text, like a
// real console rather than a data table.
const LOG_LEVEL_CLASS: Record<string, string> = {
  Info: "text-zinc-300",
  Warn: "text-amber-400",
  Error: "text-red-400",
};

function WorkerListRow({ worker, now }: { worker: WorkerRow; now: number }) {
  const unknown = worker.state === "Unknown";
  const offline = !unknown && now - (worker.lastSeen as number) > OFFLINE_AFTER_MS;
  const isError = typeof worker.state === "object" && "Error" in worker.state;

  let label: string;
  let dotColor: string;
  if (unknown) {
    label = "waiting for status…";
    dotColor = "";
  } else if (offline) {
    label = "offline";
    dotColor = "bg-muted-foreground/40";
  } else if (isError) {
    label = `broken — ${(worker.state as { Error: { reason: string } }).Error.reason}`;
    dotColor = "bg-red-500";
  } else if (worker.state === "Idle") {
    label = "idle";
    dotColor = "bg-emerald-500";
  } else {
    label = `busy — job ${(worker.state as { Busy: { job_id: string } }).Busy.job_id.slice(0, 8)}`;
    dotColor = "bg-amber-500";
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <span className="flex h-2 w-2 shrink-0 items-center justify-center">
        {unknown ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        ) : (
          <span className={cn("h-2 w-2 rounded-full", dotColor)} />
        )}
      </span>
      <span className="w-20 shrink-0 text-sm font-medium">Worker {worker.workerId}</span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-sm",
          isError && !offline && !unknown ? "text-red-500" : "text-muted-foreground",
        )}
        title={label}
      >
        {label}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {worker.timestamp ? `last fetched ${formatTime(worker.timestamp)}` : "—"}
      </span>
    </div>
  );
}

export function DiagnosticsPage() {
  const [workers, setWorkers] = useState<Map<number, WorkerRow>>(initialWorkerRows);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    invoke<LogEntry[]>("get_job_logs").then(setLogs).catch(() => {});
  }, []);

  useEffect(() => {
    const unlisten = listen<LogEntry>("job-log", (event) => {
      setLogs((prev) => [event.payload, ...prev].slice(0, 200));
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  useEffect(() => {
    const unlisten = listen<WorkerHeartbeat>("worker-status", (event) => {
      const { worker_id, state, timestamp } = event.payload;
      setWorkers((prev) => {
        const next = new Map(prev);
        next.set(worker_id, { workerId: worker_id, state, timestamp, lastSeen: Date.now() });
        return next;
      });
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  // Re-render periodically so staleness (offline detection) updates even
  // without a new heartbeat arriving.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(id);
  }, []);

  const workerRows = [...workers.values()].sort((a, b) => a.workerId - b.workerId);

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <div>
        <h2 className="mb-3 text-base font-semibold">Workers</h2>
        <div className="divide-y divide-border rounded-md border">
          {workerRows.map((w) => (
            <WorkerListRow key={w.workerId} worker={w} now={now} />
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <h2 className="mb-3 text-base font-semibold">Job Log</h2>
        <div className="min-h-0 flex-1 overflow-hidden rounded-md bg-zinc-950">
          {logs.length === 0 ? (
            <p className="p-3 font-mono text-xs text-zinc-500">No log entries yet</p>
          ) : (
            <ScrollArea className="h-full">
              <div className="flex flex-col gap-0.5 p-3 font-mono text-xs leading-relaxed">
                {logs.map((entry, i) => (
                  <div key={i} className="flex items-start gap-2 whitespace-pre-wrap break-words">
                    <span className="shrink-0 text-zinc-600">{formatTime(entry.timestamp)}</span>
                    <span
                      className={cn(
                        "shrink-0 font-semibold",
                        LOG_LEVEL_CLASS[entry.level] ?? "text-zinc-300",
                      )}
                    >
                      [{entry.level.toUpperCase()}]
                    </span>
                    <span className="shrink-0 text-zinc-500" title={entry.job_id}>
                      {entry.job_type}:
                    </span>
                    <span className={LOG_LEVEL_CLASS[entry.level] ?? "text-zinc-300"}>
                      {entry.message}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  );
}
