/**
 * webdriverio/webdriverio#4134: an actions-chain move using
 * `origin: 'pointer'` with relative x/y deltas is unreliable across driver
 * implementations — it can silently land at the wrong position, sometimes
 * not moving the pointer at all. Never fixed upstream; the workaround is
 * absolute viewport coordinates for every move step instead of a delta
 * from the pointer's current position.
 */
export async function dragCropHandle(corner: string, dx: number, dy: number) {
  // Video metadata (duration, native dimensions) loads asynchronously after
  // the drop — not synchronous with the filename label appearing — and
  // nothing that depends on it, including the crop overlay, exists before
  // then. "Submit job" is disabled until the same metadataLoaded state is
  // true (edit-video.tsx), so waiting for it to become enabled is a real
  // readiness signal, not a guessed duration.
  await $("button*=Submit job").waitForEnabled();

  const handle = await $(`[data-crop-handle="${corner}"]`);

  // crop-overlay.tsx measures its own box via a ResizeObserver, which
  // settles after mount — the handle can exist with a real DOM position
  // before that runs, still collapsed at the scale:0 fallback.
  let location = { x: 0, y: 0 };
  let size = { width: 0, height: 0 };
  await browser.waitUntil(
    async () => {
      location = await handle.getLocation();
      size = await handle.getSize();
      return size.width > 0 && size.height > 0;
    },
    { timeoutMsg: "crop handle never got a real laid-out position" },
  );
  const centerX = Math.round(location.x + size.width / 2);
  const centerY = Math.round(location.y + size.height / 2);

  // tauri-apps/wry#637: if the window doesn't already have OS focus, the
  // *first* click just grabs focus and never reaches the webview content —
  // it doesn't act as a real click. A window launched fresh as the only
  // thing running (an isolated spec file) already has focus by the time we
  // get here, but one launched after other spec files' windows have opened
  // and closed (a full-suite run) might not — so throw away one warm-up
  // click first to eat that cost, before the real drag.
  await browser
    .action("pointer")
    .move({ origin: "viewport", x: centerX, y: centerY })
    .down()
    .up()
    .perform();
  await browser.releaseActions();

  await browser
    .action("pointer")
    .move({ origin: "viewport", x: centerX, y: centerY })
    .down()
    .move({
      duration: 200,
      origin: "viewport",
      x: centerX + dx,
      y: centerY + dy,
    })
    .up()
    .perform();

  // WebDriver's `releaseActions` resets the virtual input devices' state
  // (which button is held, current pointer position) after `perform()` —
  // without it, a *later* drag in the same session can inherit stale state
  // from this one and misbehave, even though this drag itself succeeds.
  // See MDN's input.releaseActions and webdriverio#3899.
  await browser.releaseActions();
}
