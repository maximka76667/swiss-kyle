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
// Deliberately NOT pinned to one of BtbN/FFmpeg-Builds' dated
// `autobuild-*` releases — those get pruned on a rolling window (the
// previous pin 404'd once its release aged out). "latest" is a release
// BtbN keeps updated in place forever under fixed per-branch filenames
// (e.g. ffmpeg-n7.1-latest-win64-gpl-7.1.zip), so this URL never goes stale.
// These two are release/asset-name constants, not a version pin — unlike
// the VERSIONs above, nothing compares a cached ffmpeg binary against
// FFMPEG_TAG (it would always match, since the string never changes).
// downloadFfmpeg/mark-sidecar-version.ts record the binary's actual
// resolved version (from `ffmpeg -version`) in its .version marker instead,
// purely for diagnostics.
//
// The per-branch asset filenames *inside* that release are a different
// story: BtbN only keeps assets for a handful of the newest `n*` branches
// (plus `master`), rotating older ones out as new versions ship. A pin to
// one specific branch stem (e.g. "ffmpeg-n7.1-latest") 404s the moment
// BtbN cycles that branch out — this has already happened once. So nothing
// here pins a branch number; downloadFfmpeg (sidecar-downloads.ts) resolves
// whichever branch asset is actually still listed in this release at
// download time instead.
export const FFMPEG_TAG = "latest";

// Sits next to the binary, e.g. `pandoc-x86_64-unknown-linux-gnu.version`.
export function versionMarkerPath(dest: string): string {
  return `${dest}.version`;
}
