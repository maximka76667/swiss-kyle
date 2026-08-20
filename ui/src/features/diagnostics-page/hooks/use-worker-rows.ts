import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { WorkerHeartbeat } from "@/types/jobs";
import type { WorkerRow } from "@/features/diagnostics-page/lib/types";
import { initialWorkerRows } from "@/features/diagnostics-page/lib/utils";

/** Tracks each worker's latest heartbeat, plus a periodically-refreshed clock so staleness (offline detection) updates even without a new heartbeat arriving. */
export function useWorkerRows(): { workerRows: WorkerRow[]; now: number } {
  const [workers, setWorkers] =
    useState<Map<number, WorkerRow>>(initialWorkerRows);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const unlisten = listen<WorkerHeartbeat>("worker-status", (event) => {
      const { worker_id, state, timestamp } = event.payload;
      setWorkers((prev) => {
        const next = new Map(prev);
        next.set(worker_id, {
          workerId: worker_id,
          state,
          timestamp,
          lastSeen: Date.now(),
        });
        return next;
      });
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(id);
  }, []);

  const workerRows = [...workers.values()].sort(
    (a, b) => a.workerId - b.workerId,
  );

  return { workerRows, now };
}
