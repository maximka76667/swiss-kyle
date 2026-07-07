// There's no native drag-and-drop to script here (the file never crosses
// the OS), so we fire the same "tauri://drag-drop" event the WebView2 host
// emits on a real drop. This goes through the app's real listener
// (useFileDrop -> onDragDropEvent), identically to a real drop.
export async function dropFile(path: string) {
  await browser.execute((p) => {
    return (window as any).__TAURI_INTERNALS__.invoke("plugin:event|emit", {
      event: "tauri://drag-drop",
      payload: { paths: [p], position: { x: 0, y: 0 } },
    });
  }, path);
}
