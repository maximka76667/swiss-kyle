import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { LogEntry } from "@/types/jobs";

/** Loads existing job logs on mount, then appends new ones as they stream in, capped at 200 entries. */
export function useJobLogs(): LogEntry[] {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    invoke<LogEntry[]>("get_job_logs")
      .then(setLogs)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const unlisten = listen<LogEntry>("job-log", (event) => {
      setLogs((prev) => [event.payload, ...prev].slice(0, 200));
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  return logs;
}
