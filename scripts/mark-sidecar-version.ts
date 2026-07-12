// Run after CI installs a sidecar via a package manager (brew, apt) instead
// of prepare-sidecars.ts's own download step. Verifies the installed binary
// actually reports the pinned version before trusting it; if it doesn't
// match, downloads the real pinned build directly (same download machinery
// prepare-sidecars.ts uses) instead of trusting the package manager's copy.
// apt/brew resolve to whatever's in that OS's package snapshot, which
// silently drifted from the pin at least once already: Ubuntu 22.04's apt
// pandoc is 2.9.2.1, missing the typst output writer added in pandoc
// 3.1.2+, and nothing caught it until a release shipped with broken
// md→pdf conversion.
//
// New sidecars are verified by default — add a `{ version }` entry to
// SIDECARS below and it's checked (and self-healed on mismatch)
// automatically, no other change needed. Only set `verifiable: false` if
// the pin genuinely can't be checked this way, as with ffmpeg: its pin
// (FFMPEG_TAG) is a GitHub release tag that never appears in
// `ffmpeg -version` output (see sidecar-versions.ts for why that pin is
// hand-picked in the first place).
//
// Usage: bun run scripts/mark-sidecar-version.ts <name>
// e.g.:  bun run scripts/mark-sidecar-version.ts pandoc
import { execSync, spawnSync } from "child_process";
import { writeFileSync } from "fs";
import { resolve } from "path";
import { DOWNLOADS, downloadBinary } from "./sidecar-downloads";
import {
  FFMPEG_TAG,
  NATS_VERSION,
  PANDOC_VERSION,
  TYPST_VERSION,
  versionMarkerPath,
} from "./sidecar-versions";

// This script lives in scripts/, but all its paths (src-tauri/binaries/...)
// are relative to the repo root, one level up.
process.chdir(resolve(import.meta.dir, ".."));

type SidecarConfig = {
  version: string;
  // Whether `<binary> --version` output can be checked to contain `version`
  // before trusting the package manager's copy. Defaults to true.
  verifiable?: boolean;
};

const SIDECARS: Record<string, SidecarConfig> = {
  "nats-server": { version: NATS_VERSION },
  pandoc: { version: PANDOC_VERSION },
  typst: { version: TYPST_VERSION },
  ffmpeg: { version: FFMPEG_TAG, verifiable: false },
};

const name = process.argv[2];
const config = SIDECARS[name];
if (!config) {
  throw new Error(
    `Unknown sidecar "${name}" — expected one of: ${Object.keys(SIDECARS).join(", ")}`,
  );
}
const { version, verifiable = true } = config;

const isWindows = process.platform === "win32";
const EXT = isWindows ? ".exe" : "";
const TRIPLE = execSync("rustc -vV", { encoding: "utf8" })
  .match(/^host:\s*(.+)$/m)![1]
  .trim();
const dest = `src-tauri/binaries/${name}-${TRIPLE}${EXT}`;

if (!verifiable) {
  writeFileSync(versionMarkerPath(dest), version);
  console.log(`Marked ${dest} as ${name} ${version} (unverified).`);
} else {
  const result = spawnSync(dest, ["--version"], { encoding: "utf8" });
  const output = result.error ? "" : result.stdout + result.stderr;
  if (result.status === 0 && output.includes(version)) {
    writeFileSync(versionMarkerPath(dest), version);
    console.log(`Verified ${dest} reports ${version}; marked as satisfying the pin.`);
  } else {
    console.warn(
      `Installed ${name} does not match the pin: expected "${version}" to appear in ` +
        `'${dest} --version' output, got:\n${output || result.error}\n` +
        `Downloading the pinned build directly instead of trusting the package manager...`,
    );
    await downloadBinary(dest, `${name} ${version}`, version, DOWNLOADS[name], TRIPLE);
  }
}
