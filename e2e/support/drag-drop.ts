// There's no native drag-and-drop to script here (the file never crosses
// the OS), so we fire the same "tauri://drag-drop" event the WebView2 host
// emits on a real drop. This goes through the app's real listener
// (useFileDrop -> onDragDropEvent), identically to a real drop.
//
// useFileDrop's listener registration is an async IPC round-trip — it isn't
// actually attached the moment the dropzone renders, so emitting right after
// the dropzone becomes visible can fire into the void. `data-drop-ready`
// reflects the real listener state, not just render state.
export async function dropFile(path: string) {
  const dropZone = await $('[data-drop-ready="true"]');
  await dropZone.waitForExist({ timeout: 10000 });

  await browser.execute((p) => {
    return (window as any).__TAURI_INTERNALS__.invoke("plugin:event|emit", {
      event: "tauri://drag-drop",
      payload: { paths: [p], position: { x: 0, y: 0 } },
    });
  }, path);
}
