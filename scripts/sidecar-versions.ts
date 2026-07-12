// Shared between prepare-sidecars.ts (which downloads these binaries) and
// mark-sidecar-version.ts (which CI uses to tell prepare-sidecars.ts a
// binary it installed via a package manager already satisfies a pin,
// without re-downloading it). Kept in its own module, importable without
// side effects — prepare-sidecars.ts runs real work (process kills, cargo
// builds, network calls) top-to-bottom as soon as it's loaded.
export const NATS_VERSION = "2.10.22";
export const PANDOC_VERSION = "3.6.3";
export const TYPST_VERSION = "0.15.0";
export const PDFCPU_VERSION = "0.13.0";
// See prepare-sidecars.ts for why this is pinned to a tagged release
// instead of BtbN/FFmpeg-Builds' floating "latest".
export const FFMPEG_TAG = "autobuild-2026-07-03-13-21";
export const FFMPEG_ASSET_STEM = "ffmpeg-n7.1.5-1-g7d0e842004";

// Sits next to the binary, e.g. `pandoc-x86_64-unknown-linux-gnu.version`.
export function versionMarkerPath(dest: string): string {
  return `${dest}.version`;
}
