// Shared download machinery + per-tool source-of-truth URLs, used by
// prepare-sidecars.ts (the normal path: download whatever's missing or
// stale) and by mark-sidecar-version.ts (the CI fallback path: a
// package-manager-installed binary didn't match its pin, so download the
// real one the same way prepare-sidecars.ts would have).
import { spawnSync } from "child_process";
import { randomBytes } from "crypto";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  FFMPEG_ASSET_STEM,
  FFMPEG_TAG,
  NATS_VERSION,
  PANDOC_VERSION,
  PDFCPU_VERSION,
  TYPST_VERSION,
  versionMarkerPath,
} from "./sidecar-versions";

export function present(path: string): boolean {
  try {
    return statSync(path).size > 0;
  } catch {
    return false;
  }
}

// A version bump (pinned constant changed) needs to actually invalidate a
// machine's existing cache — `present()` alone only proves *a* file is
// there, not that it's the file the current pin expects. A stale binary
// left over from an older pin otherwise sits there forever, silently never
// refreshed, since nothing else here would ever notice or re-download it.
export function cachedVersionMatches(dest: string, version: string): boolean {
  if (!present(dest)) return false;
  try {
    return readFileSync(versionMarkerPath(dest), "utf8").trim() === version;
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

async function extract(url: string, binaryName: string, dest: string): Promise<void> {
  const tmp = join(tmpdir(), randomBytes(8).toString("hex"));
  mkdirSync(tmp, { recursive: true });
  try {
    console.log(`Downloading ${url.split("/").pop()}...`);
    const archive = join(tmp, "archive");
    // curl, not fetch()+Bun.write() — Bun's fetch hung indefinitely and
    // reproducibly (confirmed 3 separate times, on two different files) part
    // way through large (100MB+) downloads in this environment: sustained
    // ~100% CPU, no network connection and no subprocess visible while
    // stuck, never recovering on its own. curl never reproduced this once
    // across many manual re-tests of the same URLs.
    //
    // Explicit timeouts + retries: this exact download path (curl fetching a
    // GitHub Releases asset) is also why CI installs some sidecars via
    // apt/brew instead of calling this directly — those downloads were
    // observed to occasionally stall in GitHub Actions specifically, for
    // reasons never root-caused. mark-sidecar-version.ts's mismatch fallback
    // reintroduces this same download on CI as a rarely-hit path, so a stall
    // here needs to fail fast and loud instead of silently hanging until
    // the job's own multi-hour timeout kills it.
    const downloaded = spawnSync(
      "curl",
      [
        "-fL",
        "--connect-timeout",
        "15",
        "--max-time",
        "300",
        "--retry",
        "2",
        "--retry-delay",
        "5",
        "-o",
        archive,
        url,
      ],
      { stdio: "inherit" },
    );
    if (downloaded.status !== 0) throw new Error(`curl failed fetching ${url}`);
    const extracted = spawnSync("tar", ["-xf", archive, "-C", tmp], {
      stdio: "inherit",
    });
    if (extracted.status !== 0) throw new Error("tar extraction failed");
    const found = findFile(tmp, binaryName);
    if (!found) throw new Error(`${binaryName} not found in archive`);
    copyFileSync(found, dest);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export type TripleMap = Partial<Record<string, { url: string; binary: string }>>;

// Downloads `dest` if it's missing or its version marker doesn't match
// `version` — a no-op otherwise. This is the one place that decides "is a
// re-download needed", shared by prepare-sidecars.ts's normal run and by
// mark-sidecar-version.ts's mismatch fallback.
export async function downloadBinary(
  dest: string,
  label: string,
  version: string,
  map: TripleMap,
  triple: string,
): Promise<void> {
  if (cachedVersionMatches(dest, version)) {
    console.log(`${label} already present at ${version}, skipping download`);
    return;
  }
  const entry = map[triple];
  if (!entry)
    throw new Error(
      `No ${label} download defined for ${triple} — place the binary manually at ${dest}`,
    );
  await extract(entry.url, entry.binary, dest);
  writeFileSync(versionMarkerPath(dest), version);
  console.log(`${label} ready at ${dest}`);
}

// One entry per sidecar, keyed the same as SIDECARS in
// mark-sidecar-version.ts and the tool names used throughout prepare-sidecars.ts.
export const DOWNLOADS: Record<string, TripleMap> = {
  "nats-server": {
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
  ffmpeg: {
    "x86_64-unknown-linux-gnu": {
      url: `https://github.com/BtbN/FFmpeg-Builds/releases/download/${FFMPEG_TAG}/${FFMPEG_ASSET_STEM}-linux64-gpl-7.1.tar.xz`,
      binary: "ffmpeg",
    },
    "aarch64-unknown-linux-gnu": {
      url: `https://github.com/BtbN/FFmpeg-Builds/releases/download/${FFMPEG_TAG}/${FFMPEG_ASSET_STEM}-linuxarm64-gpl-7.1.tar.xz`,
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
      url: `https://github.com/BtbN/FFmpeg-Builds/releases/download/${FFMPEG_TAG}/${FFMPEG_ASSET_STEM}-win64-gpl-7.1.zip`,
      binary: "ffmpeg.exe",
    },
    "x86_64-pc-windows-gnu": {
      url: `https://github.com/BtbN/FFmpeg-Builds/releases/download/${FFMPEG_TAG}/${FFMPEG_ASSET_STEM}-win64-gpl-7.1.zip`,
      binary: "ffmpeg.exe",
    },
  },
  pandoc: {
    "x86_64-unknown-linux-gnu": {
      url: `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-linux-amd64.tar.gz`,
      binary: "pandoc",
    },
    "aarch64-unknown-linux-gnu": {
      url: `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-linux-arm64.tar.gz`,
      binary: "pandoc",
    },
    "x86_64-apple-darwin": {
      url: `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-x86_64-macOS.zip`,
      binary: "pandoc",
    },
    "aarch64-apple-darwin": {
      url: `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-arm64-macOS.zip`,
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
  typst: {
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
  pdfcpu: {
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
};
