import type { WorkerHeartbeat } from "@/types/jobs";

export type WorkerRow = {
  workerId: number;
  // "Unknown" = no heartbeat received yet this session.
  state: WorkerHeartbeat["state"] | "Unknown";
  timestamp: string | null;
  lastSeen: number | null;
};

export interface WorkerRowDisplay {
  label: string;
  dotColor: string;
  unknown: boolean;
  offline: boolean;
  isError: boolean;
}
