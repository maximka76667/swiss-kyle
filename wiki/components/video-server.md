# Video Server

**Type**: component
**Summary**: `src-tauri/src/video_server.rs` — a local Axum HTTP server that serves video files from the filesystem with HTTP range support, used by the frontend's `<video>` element to stream files through the Tauri webview.
**Tags**: #component #tauri #video #axum #range-request
**Sources**: [[src-tauri/src/video_server.rs]]
**Related**: [[wiki/components/tauri-app]], [[wiki/components/frontend]]
**Last Updated**: 2026-06-28

---

## Overview

Tauri's webview cannot directly load arbitrary filesystem paths as `src` for a `<video>` element — the `file://` scheme or custom protocol faces security restrictions in the webview and does not support HTTP range requests, which browsers require to seek in videos. The video server solves this by binding a standard Axum HTTP server on `127.0.0.1:0` (OS-assigned port) and serving files at `GET /?path=<absolute_path>`.

## Details

### Route

```
GET http://127.0.0.1:<port>/?path=<url-encoded absolute file path>
```

The frontend calls the `get_stream_port` Tauri command once to discover the port, then constructs the URL per video.

### Range request handling

The server supports the `Range: bytes=<start>-[end]` header:

- **Open-ended request** (`bytes=<start>-`): serves 2 MB starting at `start`. The 2 MB cap was chosen to support forward-seeking; an earlier 1 MB cap caused the browser to snap back to the start when the user seeked past a chunk boundary.
- **Explicit range** (`bytes=<start>-<end>`): serves exactly that slice.
- **No Range header**: serves the entire file.

Responses include `Accept-Ranges: bytes`, `Content-Range`, and correct MIME type. Partial content returns HTTP 206.

### MIME detection

Extension-based: `mp4 → video/mp4`, `mov → video/quicktime`, `mkv → video/x-matroska`, `webm → video/webm`, `avi → video/x-msvideo`. Unknown extensions default to `video/mp4`.

### Threading

File I/O runs in `tokio::task::spawn_blocking` to avoid blocking the async executor.

### Startup

`video_server::start()` is called during `tauri::Builder::setup`. It binds on port 0, records the OS-assigned port, spawns the Axum server in the Tauri async runtime, and returns the port number. The port is stored in `VideoServerPort` managed state and exposed via `get_stream_port`.

## Decisions & Rationale

Using an ephemeral local HTTP server rather than a Tauri custom protocol because:
1. Standard HTTP with range requests is what browsers expect for `<video>` seeking.
2. Custom protocols in Tauri/WebKitGTK do not relay range headers, so `<video>` seeking broke in practice (→ memory: video-playback-debug).
3. Binding on `127.0.0.1:0` means no fixed port conflict and no network exposure.

## Known Issues / Tech Debt

- No authentication on the server — any local process can read any file the Tauri app can read. Acceptable since everything runs on the user's own machine.
- File reads are fully buffered into memory for explicit ranges; very large explicit-range requests could spike RAM.

## Related

[[wiki/components/tauri-app]], [[wiki/components/frontend]]
