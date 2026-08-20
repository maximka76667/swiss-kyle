// 3x the worker's 5s heartbeat publish interval (crates/worker/src/main.rs
// WORKER_HEARTBEAT_INTERVAL) — a worker that misses this many ticks in a row
// is treated as offline rather than merely between beats.
export const OFFLINE_AFTER_MS = 15_000;

// Matches the backend's worker-count cap (src-tauri/src/lib.rs: cores
// capped at 4). Placeholder rows are seeded for all 4 up front so the list
// renders at its final size immediately instead of growing (and jumping
// the layout) as heartbeats trickle in — a machine with fewer cores just
// leaves the extra rows on "waiting for status" indefinitely.
export const WORKER_COUNT = 4;

// Terminal-style coloring: dim gray metadata, level-tinted text, like a
// real console rather than a data table.
export const LOG_LEVEL_CLASS: Record<string, string> = {
  Info: "text-zinc-300",
  Warn: "text-amber-400",
  Error: "text-red-400",
};
