import { execSync, spawnSync } from "child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync } from "fs";
import { join, resolve } from "path";
import { DOWNLOADS, downloadBinary } from "./sidecar-downloads";
import {
  FFMPEG_TAG,
  NATS_VERSION,
  PANDOC_VERSION,
  PDFCPU_VERSION,
  TYPST_VERSION,
} from "./sidecar-versions";

// This script lives in scripts/, but all its paths (src-tauri/binaries/...)
// are relative to the repo root, one level up — chdir there so it behaves
// the same regardless of the caller's own cwd (e.g. e2e/package.json
// invokes this via a relative `../scripts/...` path from inside e2e/).
process.chdir(resolve(import.meta.dir, ".."));

const isWindows = process.platform === "win32";
const EXT = isWindows ? ".exe" : "";

const rustcOutput = execSync("rustc -vV", { encoding: "utf8" });
const TRIPLE = rustcOutput.match(/^host:\s*(.+)$/m)![1].trim();
console.log(`Detected triple: ${TRIPLE}`);

const BIN_DIR = "src-tauri/binaries";
mkdirSync(BIN_DIR, { recursive: true });

// Kill stale sidecar processes (from a previous run that didn't exit
// cleanly) that would lock binaries during rebuild. Only kills PIDs read
// from our own pidfile (written by the app on spawn) after verifying the
// PID is still running one of our binaries - never guesses by process name,
// since a name/pattern match can hit unrelated processes (e.g. `pkill -f
// worker` matching VS Code's own renderer, which carries "worker" in a
// --service-worker-schemes flag).
const PID_FILE = join(BIN_DIR, ".sidecar-pids");

function pidBelongsToOurBinaries(pid: number): boolean {
  const binDir = resolve(BIN_DIR);
  if (isWindows) {
    const r = spawnSync(
      "powershell",
      ["-NoProfile", "-Command", `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).Path`],
      { encoding: "utf8" },
    );
    return r.status === 0 && r.stdout.trim().startsWith(binDir);
  }
  const r = spawnSync("ps", ["-p", String(pid), "-o", "args="], { encoding: "utf8" });
  return r.status === 0 && r.stdout.includes(binDir);
}

function killLeftoverSidecars(): void {
  let lines: string[];
  try {
    lines = readFileSync(PID_FILE, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
  } catch {
    return; // no pidfile, nothing to clean up
  }
  for (const line of lines) {
    const pid = Number(line);
    if (!pid || !pidBelongsToOurBinaries(pid)) {
      console.log(`Skipping PID ${line} — no longer verifiable as one of our sidecars`);
      continue;
    }
    console.log(`Killing leftover sidecar process ${pid}`);
    if (isWindows) {
      spawnSync("taskkill", ["/PID", String(pid), "/F", "/T"], { stdio: "ignore" });
    } else {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // already gone, fine
      }
    }
  }
  rmSync(PID_FILE, { force: true });
}

killLeftoverSidecars();

// --- Worker (always rebuild) ---
execSync("cargo build -p swiss-kyle-worker", { stdio: "inherit" });
copyFileSync(
  `target/debug/swiss-kyle-worker${EXT}`,
  `${BIN_DIR}/swiss-kyle-worker-${TRIPLE}${EXT}`,
);

// --- nats-server ---
await downloadBinary(
  `${BIN_DIR}/nats-server-${TRIPLE}${EXT}`,
  `nats-server ${NATS_VERSION}`,
  NATS_VERSION,
  DOWNLOADS["nats-server"],
  TRIPLE,
);

// --- ffmpeg ---
await downloadBinary(
  `${BIN_DIR}/ffmpeg-${TRIPLE}${EXT}`,
  `ffmpeg (${FFMPEG_TAG})`,
  FFMPEG_TAG,
  DOWNLOADS.ffmpeg,
  TRIPLE,
);

// --- pandoc ---
await downloadBinary(
  `${BIN_DIR}/pandoc-${TRIPLE}${EXT}`,
  `pandoc ${PANDOC_VERSION}`,
  PANDOC_VERSION,
  DOWNLOADS.pandoc,
  TRIPLE,
);

// --- typst ---
await downloadBinary(
  `${BIN_DIR}/typst-${TRIPLE}${EXT}`,
  `typst ${TYPST_VERSION}`,
  TYPST_VERSION,
  DOWNLOADS.typst,
  TRIPLE,
);

// --- pdfcpu ---
await downloadBinary(
  `${BIN_DIR}/pdfcpu-${TRIPLE}${EXT}`,
  `pdfcpu ${PDFCPU_VERSION}`,
  PDFCPU_VERSION,
  DOWNLOADS.pdfcpu,
  TRIPLE,
);
