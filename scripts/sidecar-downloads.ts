// Shared download machinery + per-tool source-of-truth URLs, used by
// prepare-sidecars.ts (the normal path: download whatever's missing or
// stale) and by mark-sidecar-version.ts (the CI fallback path: a
// package-manager-installed binary didn't match its pin, so download the
// real one the same way prepare-sidecars.ts would have).
import { spawnSync } from "child_process";
import { randomBytes } from "crypto";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
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

async function extract(
  url: string | (() => Promise<string>),
  binaryName: string,
  dest: string,
): Promise<void> {
  const resolvedUrl = typeof url === "function" ? await url() : url;
  const tmp = join(tmpdir(), randomBytes(8).toString("hex"));
  mkdirSync(tmp, { recursive: true });
  try {
    console.log(`Downloading ${resolvedUrl.split("/").pop()}...`);
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
        resolvedUrl,
      ],
      { stdio: "inherit" },
    );
    if (downloaded.status !== 0)
      throw new Error(`curl failed fetching ${resolvedUrl}`);
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

export type TripleMap = Partial<
  Record<string, { url: string | (() => Promise<string>); binary: string }>
>;

// Extracts the `n7.1`-style branch version embedded in a BtbN asset name
// (e.g. "ffmpeg-n9.0-latest-win64-gpl-9.0.zip" → 9000, so newer branches
// sort higher) into a comparable number.
function btbnBranchVersion(assetName: string): number {
  const match = assetName.match(/-n(\d+)\.(\d+)-latest-/);
  if (!match) return -1;
  return Number(match[1]) * 1000 + Number(match[2]);
}

// BtbN/FFmpeg-Builds' "latest" release is permanent, but the per-branch
// asset filenames inside it are not — BtbN only keeps assets for a handful
// of the newest `n*` branches (plus `master`), rotating older ones out as
// new versions ship. A pin to one specific branch stem (e.g.
// "ffmpeg-n7.1-latest") 404s the moment BtbN cycles that branch out — this
// has already happened once. So instead of hardcoding a branch number,
// this resolves whichever branch asset matching `assetPattern` is actually
// still listed in the release at download time, preferring the newest
// branch if more than one matches.
function resolveBtbnFfmpegAsset(assetPattern: RegExp): () => Promise<string> {
  return async () => {
    const tmp = join(tmpdir(), `${randomBytes(8).toString("hex")}.json`);
    try {
      // curl, not fetch() — see the comment in extract() above for why.
      //
      // Authenticated when a token is available: unauthenticated api.github.com
      // requests are rate-limited to 60/hour per source IP, and GitHub-hosted
      // runners share IP pools across the world's Actions traffic — easily
      // exhausted, producing a 403 unrelated to anything this workflow did.
      // GITHUB_TOKEN raises that to 5000/hour; harmless to omit locally
      // (dev machines don't hit the shared-IP limit in practice).
      const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
      const fetched = spawnSync(
        "curl",
        [
          "-fL",
          "--connect-timeout",
          "15",
          "--max-time",
          "30",
          ...(token ? ["-H", `Authorization: Bearer ${token}`] : []),
          "-o",
          tmp,
          `https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/tags/${FFMPEG_TAG}`,
        ],
        { stdio: "inherit" },
      );
      if (fetched.status !== 0)
        throw new Error(
          "curl failed fetching BtbN/FFmpeg-Builds release metadata",
        );
      const release = JSON.parse(readFileSync(tmp, "utf8")) as {
        assets: { name: string; browser_download_url: string }[];
      };
      const matches = release.assets.filter((a) => assetPattern.test(a.name));
      if (matches.length === 0)
        throw new Error(
          `No BtbN/FFmpeg-Builds asset in the "${FFMPEG_TAG}" release matched ${assetPattern}`,
        );
      matches.sort(
        (a, b) => btbnBranchVersion(b.name) - btbnBranchVersion(a.name),
      );
      return matches[0].browser_download_url;
    } finally {
      rmSync(tmp, { force: true });
    }
  };
}

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

// `ffmpeg -version`'s first line is e.g. "ffmpeg version
// n7.1.5-12-g1fdbca85aa Copyright ...". Used only as a diagnostic label —
// see downloadFfmpeg for why it can't gate re-downloads the way the other
// sidecars' pinned VERSION constants do.
export function detectFfmpegVersion(bin: string): string | null {
  const result = spawnSync(bin, ["-version"], { encoding: "utf8" });
  if (result.error || result.status !== 0) return null;
  return result.stdout.match(/ffmpeg version (\S+)/)?.[1] ?? null;
}

// ffmpeg is intentionally downloaded from BtbN/FFmpeg-Builds' floating
// "latest" release (see sidecar-versions.ts) instead of a pinned tag, so
// there is no target version to compare a cached binary against before
// downloading — unlike downloadBinary above, which redownloads whenever its
// caller's pinned constant changes. Here "already downloaded" is the only
// signal available, so that's what gates the skip; delete the binary (or
// its .version marker) to force a refresh. The marker still gets written
// after downloading, but purely as a human-readable record of what was
// actually fetched (via detectFfmpegVersion) — never as a comparison key.
export async function downloadFfmpeg(
  dest: string,
  map: TripleMap,
  triple: string,
): Promise<void> {
  if (present(dest)) {
    console.log(`ffmpeg already present at ${dest}, skipping download`);
    return;
  }
  const entry = map[triple];
  if (!entry)
    throw new Error(
      `No ffmpeg download defined for ${triple} — place the binary manually at ${dest}`,
    );
  await extract(entry.url, entry.binary, dest);
  const version = detectFfmpegVersion(dest) ?? "unknown";
  writeFileSync(versionMarkerPath(dest), version);
  console.log(`ffmpeg ready at ${dest} (${version})`);
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
      url: resolveBtbnFfmpegAsset(
        /^ffmpeg-n\d+\.\d+-latest-linux64-gpl-\d+\.\d+\.tar\.xz$/,
      ),
      binary: "ffmpeg",
    },
    "aarch64-unknown-linux-gnu": {
      url: resolveBtbnFfmpegAsset(
        /^ffmpeg-n\d+\.\d+-latest-linuxarm64-gpl-\d+\.\d+\.tar\.xz$/,
      ),
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
      url: resolveBtbnFfmpegAsset(
        /^ffmpeg-n\d+\.\d+-latest-win64-gpl-\d+\.\d+\.zip$/,
      ),
      binary: "ffmpeg.exe",
    },
    "x86_64-pc-windows-gnu": {
      url: resolveBtbnFfmpegAsset(
        /^ffmpeg-n\d+\.\d+-latest-win64-gpl-\d+\.\d+\.zip$/,
      ),
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
