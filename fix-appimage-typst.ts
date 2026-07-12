// linuxdeploy's GStreamer-bundling plugin (enabled via tauri.conf.json's
// bundle.linux.appimage.bundleMediaFramework) scans every ELF file in the
// AppDir for patchelf treatment, not just its own plugin files. That's
// correct and necessary for dynamically-linked binaries — they need their
// rpath patched to find bundled libs wherever the AppImage ends up mounted
// at runtime — but it corrupts `typst` specifically: it's a static-pie
// binary (self-relocating, no real external deps — the official release is
// built against musl for exactly this kind of portability), a shape
// patchelf mishandles. Confirmed via a known upstream bug
// (https://github.com/NixOS/patchelf/issues/403): it truncates typst's
// .dynamic/.got/.data segment from ~2MB down to 896 bytes, so typst
// SIGSEGVs during its own startup relocation before any of its code runs.
//
// Confirmed by direct comparison this is isolated to typst: the main app
// binary and the worker sidecar are also patched by the same pass, but
// correctly — they're normal dynamically-linked PIE binaries that legitimately
// need it. ffmpeg/pandoc/pdfcpu/nats-server aren't touched at all (they're
// either dynamically linked with no rpath issue, or plain static/non-PIE
// with no DYNAMIC segment for patchelf to find in the first place).
//
// No supported way to exclude a specific executable from linuxdeploy's
// patching pass exists (only --exclude-library, which matches shared
// libraries by name, not arbitrary bundled executables) — confirmed via
// linuxdeploy's own issue tracker. So instead: restore the pristine typst
// binary into the already-built AppDir and repackage. linuxdeploy-plugin-
// appimage's job is purely to compress whatever's currently in the AppDir
// into the final image — it doesn't re-run dependency scanning or patchelf,
// so this doesn't risk re-corrupting anything.
//
// Run this after `bunx tauri build` (or `cargo tauri build`) produces a
// Linux AppImage, before distributing it.
import { execSync, spawnSync } from "child_process";
import { copyFileSync, existsSync, readdirSync, readFileSync, renameSync, rmSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const BIN_DIR = "src-tauri/binaries";
const APPIMAGE_BUNDLE_DIR = "target/release/bundle/appimage";
const APPIMAGETOOL = join(homedir(), ".cache/tauri/linuxdeploy-plugin-appimage.AppImage");

const rustcOutput = execSync("rustc -vV", { encoding: "utf8" });
const TRIPLE = rustcOutput.match(/^host:\s*(.+)$/m)![1].trim();

if (!existsSync(APPIMAGE_BUNDLE_DIR)) {
  throw new Error(`${APPIMAGE_BUNDLE_DIR} not found — run 'bunx tauri build' first`);
}
if (!existsSync(APPIMAGETOOL)) {
  throw new Error(`${APPIMAGETOOL} not found — expected Tauri to have cached it during the build`);
}

const appDirName = readdirSync(APPIMAGE_BUNDLE_DIR, { withFileTypes: true }).find(
  (e) => e.isDirectory() && e.name.endsWith(".AppDir"),
)?.name;
if (!appDirName) {
  throw new Error(`No .AppDir found under ${APPIMAGE_BUNDLE_DIR}`);
}
const appDir = join(APPIMAGE_BUNDLE_DIR, appDirName);

const originalAppImageName = readdirSync(APPIMAGE_BUNDLE_DIR, { withFileTypes: true }).find(
  (e) => e.isFile() && e.name.endsWith(".AppImage"),
)?.name;
if (!originalAppImageName) {
  throw new Error(`No .AppImage found under ${APPIMAGE_BUNDLE_DIR} to determine the expected output filename`);
}

// usr/lib/ also contains gstreamer-1.0/ (from bundleMediaFramework) as a
// sibling of our own resources dir — read productName from tauri.conf.json
// directly instead of guessing which directory is ours from a listing.
const tauriConf = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
const productName: string = tauriConf.productName;
if (!productName) {
  throw new Error("productName not found in src-tauri/tauri.conf.json");
}

const bundledTypst = join(appDir, "usr/lib", productName, "bin", `typst-${TRIPLE}`);
const pristineTypst = join(BIN_DIR, `typst-${TRIPLE}`);

if (!existsSync(bundledTypst)) {
  throw new Error(`Bundled typst not found at ${bundledTypst}`);
}
if (!existsSync(pristineTypst)) {
  throw new Error(`Pristine typst not found at ${pristineTypst} — run 'bun prepare-sidecars.ts' first`);
}

console.log(`Restoring pristine typst into ${bundledTypst}...`);
copyFileSync(pristineTypst, bundledTypst);

console.log(`Repackaging ${appDir}...`);
const result = spawnSync(APPIMAGETOOL, [`--appdir=${appDirName}`], {
  stdio: "inherit",
  cwd: APPIMAGE_BUNDLE_DIR,
});
if (result.status !== 0) {
  throw new Error(`Repackaging failed (exit ${result.status})`);
}

// linuxdeploy-plugin-appimage names its own output differently
// (ProductName-arch.AppImage) than Tauri's build does
// (ProductName_version_arch.AppImage) — move it back to the filename Tauri
// (and anything downstream, like the release workflow) actually expects.
const producedName = readdirSync(APPIMAGE_BUNDLE_DIR, { withFileTypes: true }).find(
  (e) => e.isFile() && e.name.endsWith(".AppImage") && e.name !== originalAppImageName,
)?.name;
if (!producedName) {
  throw new Error("Repackaging reported success but no new .AppImage file was found");
}
rmSync(join(APPIMAGE_BUNDLE_DIR, originalAppImageName));
renameSync(join(APPIMAGE_BUNDLE_DIR, producedName), join(APPIMAGE_BUNDLE_DIR, originalAppImageName));

console.log(`Done: ${originalAppImageName} now has a working typst.`);
