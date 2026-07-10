import type { ChainablePromiseElement } from "webdriverio";

/**
 * wry's Linux/WebKitGTK WebDriver backend doesn't reliably deliver a
 * synthesized OS-level pointer click to these sidebar elements — confirmed
 * by controlled comparison, not theory: native `.click()` produced zero
 * successful navigations across runs with and without window decorations,
 * while dispatching `.click()` on the resolved DOM element directly (below)
 * produced successful navigations every time the element already existed.
 * Windows/WebView2 isn't affected. Bypassing the OS-level pointer path
 * sidesteps the bug entirely.
 */
export async function jsClick(el: ChainablePromiseElement) {
  // browser.execute() resolves the element reference once, immediately, with
  // no retry — unlike WDIO's native `.click()`, it doesn't wait around for
  // the element to exist. Needed on the first interaction of a freshly
  // launched window, which can otherwise race React's initial mount.
  await el.waitForExist({ timeout: 1500 });
  await browser.execute((element: HTMLElement) => element.click(), el);
}
