import { execSync, spawnSync } from "child_process";
import { randomBytes } from "crypto";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

process.chdir(import.meta.dir);

const isWindows = process.platform === "win32";
const EXT = isWindows ? ".exe" : "";

const rustcOutput = execSync("rustc -vV", { encoding: "utf8" });
const TRIPLE = rustcOutput.match(/^host:\s*(.+)$/m)![1].trim();
console.log(`Detected triple: ${TRIPLE}`);

const BIN_DIR = "src-tauri/binaries";
mkdirSync(BIN_DIR, { recursive: true });

const NATS_VERSION = "2.10.22";
const PANDOC_VERSION = "3.6.3";
const TYPST_VERSION = "0.15.0";
const PDFCPU_VERSION = "0.13.0";

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
execSync("cargo build -p worker", { stdio: "inherit" });
copyFileSync(`target/debug/worker${EXT}`, `${BIN_DIR}/worker-${TRIPLE}${EXT}`);

function present(path: string): boolean {
  try {
    return statSync(path).size > 0;
  } catch {
    return false;
  }
}

function findFile(dir: string, name: string): string | null {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(full, name);
      if (found) return found;
    } else if (entry.name === name) {
      return full;
    }
  }
  return null;
}

async function extract(
  url: string,
  binaryName: string,
  dest: string,
): Promise<void> {
  const tmp = join(tmpdir(), randomBytes(8).toString("hex"));
  mkdirSync(tmp, { recursive: true });
  try {
    console.log(`Downloading ${url.split("/").pop()}...`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    const archive = join(tmp, "archive");
    await Bun.write(archive, res);
    const result = spawnSync("tar", ["-xf", archive, "-C", tmp], {
      stdio: "inherit",
    });
    if (result.status !== 0) throw new Error("tar extraction failed");
    const found = findFile(tmp, binaryName);
    if (!found) throw new Error(`${binaryName} not found in archive`);
    copyFileSync(found, dest);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

type TripleMap = Partial<Record<string, { url: string; binary: string }>>;

async function downloadBinary(
  dest: string,
  label: string,
  map: TripleMap,
): Promise<void> {
  if (present(dest)) {
    console.log(`${label} already present, skipping download`);
    return;
  }
  const entry = map[TRIPLE];
  if (!entry)
    throw new Error(
      `No ${label} download defined for ${TRIPLE} — place the binary manually at ${dest}`,
    );
  await extract(entry.url, entry.binary, dest);
  console.log(`${label} ready at ${dest}`);
}

// --- nats-server ---
await downloadBinary(
  `${BIN_DIR}/nats-server-${TRIPLE}${EXT}`,
  `nats-server ${NATS_VERSION}`,
  {
    "x86_64-unknown-linux-gnu": {
      url: `https://github.com/nats-io/nats-server/releases/download/v${NATS_VERSION}/nats-server-v${NATS_VERSION}-linux-amd64.tar.gz`,
      binary: "nats-server",
    },
    "aarch64-unknown-linux-gnu": {
      url: `https://github.com/nats-io/nats-server/releases/download/v${NATS_VERSION}/nats-server-v${NATS_VERSION}-linux-arm64.tar.gz`,
      binary: "nats-server",
    },
    "x86_64-apple-darwin": {
      url: `https://github.com/nats-io/nats-server/releases/download/v${NATS_VERSION}/nats-server-v${NATS_VERSION}-darwin-amd64.zip`,
      binary: "nats-server",
    },
    "aarch64-apple-darwin": {
      url: `https://github.com/nats-io/nats-server/releases/download/v${NATS_VERSION}/nats-server-v${NATS_VERSION}-darwin-arm64.zip`,
      binary: "nats-server",
    },
    "x86_64-pc-windows-msvc": {
      url: `https://github.com/nats-io/nats-server/releases/download/v${NATS_VERSION}/nats-server-v${NATS_VERSION}-windows-amd64.zip`,
      binary: "nats-server.exe",
    },
    "x86_64-pc-windows-gnu": {
      url: `https://github.com/nats-io/nats-server/releases/download/v${NATS_VERSION}/nats-server-v${NATS_VERSION}-windows-amd64.zip`,
      binary: "nats-server.exe",
    },
  },
);

// --- ffmpeg ---
await downloadBinary(`${BIN_DIR}/ffmpeg-${TRIPLE}${EXT}`, "ffmpeg", {
  "x86_64-unknown-linux-gnu": {
    url: "https://github.com/BtbN/ffmpeg-builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz",
    binary: "ffmpeg",
  },
  "aarch64-unknown-linux-gnu": {
    url: "https://github.com/BtbN/ffmpeg-builds/releases/download/latest/ffmpeg-master-latest-linuxarm64-gpl.tar.xz",
    binary: "ffmpeg",
  },
  "x86_64-apple-darwin": {
    url: "https://evermeet.cx/ffmpeg/getrelease/zip",
    binary: "ffmpeg",
  },
  "aarch64-apple-darwin": {
    url: "https://evermeet.cx/ffmpeg/getrelease/zip",
    binary: "ffmpeg",
  },
  "x86_64-pc-windows-msvc": {
    url: "https://github.com/BtbN/ffmpeg-builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip",
    binary: "ffmpeg.exe",
  },
  "x86_64-pc-windows-gnu": {
    url: "https://github.com/BtbN/ffmpeg-builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip",
    binary: "ffmpeg.exe",
  },
});

// --- pandoc ---
await downloadBinary(
  `${BIN_DIR}/pandoc-${TRIPLE}${EXT}`,
  `pandoc ${PANDOC_VERSION}`,
  {
    "x86_64-unknown-linux-gnu": {
      url: `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-linux-amd64.tar.gz`,
      binary: "pandoc",
    },
    "aarch64-unknown-linux-gnu": {
      url: `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-linux-arm64.tar.gz`,
      binary: "pandoc",
    },
    "x86_64-apple-darwin": {
      url: `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-macOS.zip`,
      binary: "pandoc",
    },
    "aarch64-apple-darwin": {
      url: `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-macOS.zip`,
      binary: "pandoc",
    },
    "x86_64-pc-windows-msvc": {
      url: `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-windows-x86_64.zip`,
      binary: "pandoc.exe",
    },
    "x86_64-pc-windows-gnu": {
      url: `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-windows-x86_64.zip`,
      binary: "pandoc.exe",
    },
  },
);

// --- typst ---
await downloadBinary(
  `${BIN_DIR}/typst-${TRIPLE}${EXT}`,
  `typst ${TYPST_VERSION}`,
  {
    "x86_64-unknown-linux-gnu": {
      url: `https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-x86_64-unknown-linux-musl.tar.xz`,
      binary: "typst",
    },
    "aarch64-unknown-linux-gnu": {
      url: `https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-aarch64-unknown-linux-musl.tar.xz`,
      binary: "typst",
    },
    "x86_64-apple-darwin": {
      url: `https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-x86_64-apple-darwin.tar.xz`,
      binary: "typst",
    },
    "aarch64-apple-darwin": {
      url: `https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-aarch64-apple-darwin.tar.xz`,
      binary: "typst",
    },
    "x86_64-pc-windows-msvc": {
      url: `https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-x86_64-pc-windows-msvc.zip`,
      binary: "typst.exe",
    },
    "x86_64-pc-windows-gnu": {
      url: `https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-x86_64-pc-windows-msvc.zip`,
      binary: "typst.exe",
    },
  },
);

// --- pdfcpu ---
await downloadBinary(
  `${BIN_DIR}/pdfcpu-${TRIPLE}${EXT}`,
  `pdfcpu ${PDFCPU_VERSION}`,
  {
    "x86_64-unknown-linux-gnu": {
      url: `https://github.com/pdfcpu/pdfcpu/releases/download/v${PDFCPU_VERSION}/pdfcpu_${PDFCPU_VERSION}_Linux_x86_64.tar.xz`,
      binary: "pdfcpu",
    },
    "aarch64-unknown-linux-gnu": {
      url: `https://github.com/pdfcpu/pdfcpu/releases/download/v${PDFCPU_VERSION}/pdfcpu_${PDFCPU_VERSION}_Linux_arm64.tar.xz`,
      binary: "pdfcpu",
    },
    "x86_64-apple-darwin": {
      url: `https://github.com/pdfcpu/pdfcpu/releases/download/v${PDFCPU_VERSION}/pdfcpu_${PDFCPU_VERSION}_Darwin_x86_64.tar.xz`,
      binary: "pdfcpu",
    },
    "aarch64-apple-darwin": {
      url: `https://github.com/pdfcpu/pdfcpu/releases/download/v${PDFCPU_VERSION}/pdfcpu_${PDFCPU_VERSION}_Darwin_arm64.tar.xz`,
      binary: "pdfcpu",
    },
    "x86_64-pc-windows-msvc": {
      url: `https://github.com/pdfcpu/pdfcpu/releases/download/v${PDFCPU_VERSION}/pdfcpu_${PDFCPU_VERSION}_Windows_x86_64.zip`,
      binary: "pdfcpu.exe",
    },
    "x86_64-pc-windows-gnu": {
      url: `https://github.com/pdfcpu/pdfcpu/releases/download/v${PDFCPU_VERSION}/pdfcpu_${PDFCPU_VERSION}_Windows_x86_64.zip`,
      binary: "pdfcpu.exe",
    },
  },
);

