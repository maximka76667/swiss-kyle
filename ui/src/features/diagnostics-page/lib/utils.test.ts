import { describe, expect, it } from "bun:test";
import { initialWorkerRows, workerRowDisplay } from "./utils";
import type { WorkerRow } from "./types";

describe("initialWorkerRows", () => {
  it("seeds one Unknown row per worker slot, keyed by worker id", () => {
    const rows = initialWorkerRows();
    expect(rows.size).toBe(4);
    for (let i = 0; i < 4; i++) {
      expect(rows.get(i)).toEqual({
        workerId: i,
        state: "Unknown",
        timestamp: null,
        lastSeen: null,
      });
    }
  });
});

describe("workerRowDisplay", () => {
  const base: WorkerRow = {
    workerId: 0,
    state: "Unknown",
    timestamp: null,
    lastSeen: null,
  };

  it("labels a row with no heartbeat yet as waiting for status", () => {
    const result = workerRowDisplay(base, Date.now());
    expect(result).toMatchObject({ label: "waiting for status…", unknown: true });
  });

  it("labels a stale row as offline once it exceeds OFFLINE_AFTER_MS", () => {
    const now = Date.now();
    const worker: WorkerRow = { ...base, state: "Idle", lastSeen: now - 20_000 };
    const result = workerRowDisplay(worker, now);
    expect(result).toMatchObject({ label: "offline", offline: true });
  });

  it("does not mark a recent heartbeat as offline", () => {
    const now = Date.now();
    const worker: WorkerRow = { ...base, state: "Idle", lastSeen: now - 1_000 };
    const result = workerRowDisplay(worker, now);
    expect(result).toMatchObject({ label: "idle", offline: false });
  });

  it("surfaces the error reason for a broken worker", () => {
    const now = Date.now();
    const worker: WorkerRow = {
      ...base,
      state: { Error: { reason: "nats disconnected" } },
      lastSeen: now,
    };
    const result = workerRowDisplay(worker, now);
    expect(result).toMatchObject({
      label: "broken — nats disconnected",
      isError: true,
      dotColor: "bg-red-500",
    });
  });

  it("truncates the job id for a busy worker", () => {
    const now = Date.now();
    const worker: WorkerRow = {
      ...base,
      state: { Busy: { job_id: "0123456789abcdef" } },
      lastSeen: now,
    };
    const result = workerRowDisplay(worker, now);
    expect(result).toMatchObject({ label: "busy — job 01234567" });
  });
});
