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

/**
 * Reads a video's pixel dimensions by parsing ffmpeg's own stderr banner
 * (`-i <path>` with no output prints a nonzero exit code but always logs
 * the input stream info first) — there's no ffprobe sidecar bundled, only
 * ffmpeg-*, so this is the cheapest way to check a crop actually took
 * effect without adding a new bundled tool just for the test suite.
 */
export function getVideoDimensions(
  path: string,
): { width: number; height: number } | null {
  const result = spawnSync(bundledFfmpeg(), ["-i", path], {
    encoding: "utf8",
  });
  // Must anchor on ", WxH" (comma before, space/comma after) — the stream
  // line also has a hex codec tag like "0x31637661" right before the real
  // resolution, which a looser \d+x\d+ match picks up as width=0 instead.
  const match = result.stderr.match(/,\s*(\d+)x(\d+)(?=[\s,])/);
  if (!match) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
}
