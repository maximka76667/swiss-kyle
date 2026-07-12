// Run after CI installs a sidecar via a package manager (brew, apt) instead
// of prepare-sidecars.ts's own download step, so prepare-sidecars.ts's
// version-cache check (see sidecar-versions.ts) recognizes it as already
// satisfying the pin and doesn't try (and fail) to re-download it itself.
//
// Usage: bun run mark-sidecar-version.ts <name>
// e.g.:  bun run mark-sidecar-version.ts pandoc
import { execSync } from "child_process";
import { writeFileSync } from "fs";
import {
  FFMPEG_TAG,
  NATS_VERSION,
  PANDOC_VERSION,
  TYPST_VERSION,
  versionMarkerPath,
} from "./sidecar-versions";

process.chdir(import.meta.dir);

const VERSIONS: Record<string, string> = {
  "nats-server": NATS_VERSION,
  pandoc: PANDOC_VERSION,
  typst: TYPST_VERSION,
  ffmpeg: FFMPEG_TAG,
};

const name = process.argv[2];
const version = VERSIONS[name];
if (!version) {
  throw new Error(
    `Unknown sidecar "${name}" — expected one of: ${Object.keys(VERSIONS).join(", ")}`,
  );
}

const isWindows = process.platform === "win32";
const EXT = isWindows ? ".exe" : "";
const TRIPLE = execSync("rustc -vV", { encoding: "utf8" })
  .match(/^host:\s*(.+)$/m)![1]
  .trim();
const dest = `src-tauri/binaries/${name}-${TRIPLE}${EXT}`;

writeFileSync(versionMarkerPath(dest), version);
console.log(`Marked ${dest} as ${name} ${version}`);
