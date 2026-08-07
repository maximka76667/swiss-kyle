import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

/** Finds the bundled sidecar regardless of the current platform's target triple suffix. */
function bundledFfmpeg(): string {
  const dir = resolve(import.meta.dirname, "../../src-tauri/binaries");
  const name = readdirSync(dir).find(
    (f) => f.startsWith("ffmpeg-") && !f.endsWith(".version"),
  );
  if (!name) throw new Error(`no ffmpeg binary found in ${dir}`);
  return resolve(dir, name);
}

/**
 * Fully decodes a file's first video stream and returns how many frames
 * actually came out. A file can be well-formed and exit ffmpeg with status 0
 * while containing zero video frames (audio-only) — metadata alone can't
 * distinguish that from a real video, only decoding every frame can.
 */
export function countDecodedVideoFrames(path: string): number {
  const result = spawnSync(
    bundledFfmpeg(),
    ["-v", "error", "-stats", "-i", path, "-map", "0:v:0", "-f", "null", "-"],
    { encoding: "utf8" },
  );
  const matches = [...result.stderr.matchAll(/frame=\s*(\d+)/g)];
  if (matches.length === 0) return 0;
  return Number(matches[matches.length - 1][1]);
}
