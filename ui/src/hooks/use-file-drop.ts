import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";

/**
 * Listens for OS files dropped anywhere on the window. Tauri intercepts
 * native HTML5 drag-and-drop at the WebView layer (so it can resolve real
 * filesystem paths, which browsers otherwise hide), so plain `onDrop` /
 * `event.dataTransfer.files[*].path` never fires with real paths — this is
 * the only way to receive dropped file paths.
 */
export function useFileDrop(onDrop: (paths: string[]) => void) {
  const [isDragging, setIsDragging] = useState(false);
  // `onDragDropEvent` registers the listener over IPC — it isn't actually
  // attached until that promise resolves, which can lag well behind this
  // component's render (and any DOM text a caller might wait on instead).
  const [ready, setReady] = useState(false);
  const onDropRef = useRef(onDrop);
  useEffect(() => {
    onDropRef.current = onDrop;
  }, [onDrop]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "over" || event.payload.type === "enter") {
          setIsDragging(true);
        } else if (event.payload.type === "drop") {
          setIsDragging(false);
          onDropRef.current(event.payload.paths);
        } else {
          setIsDragging(false);
        }
      })
      .then((fn) => {
        if (cancelled) fn();
        else {
          unlisten = fn;
          setReady(true);
        }
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return { isDragging, ready };
}
