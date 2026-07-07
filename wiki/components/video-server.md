# Video Server

**Type**: component
**Summary**: `src-tauri/src/video_server.rs` — a local Axum HTTP server that streams video files to the frontend's `<video>` element with HTTP range support, gated by an unguessable per-file token so it cannot serve arbitrary paths on disk.
**Tags**: #component #tauri #video #axum #range-request #security
**Sources**: [[src-tauri/src/video_server.rs]], [[src-tauri/src/lib.rs]], [[ui/src/components/video-player.tsx]]
**Related**: [[wiki/components/tauri-app]], [[wiki/components/frontend]]
**Last Updated**: 2026-07-02

---

## Overview

Tauri's webview cannot directly load arbitrary filesystem paths as `src` for a `<video>` element — the `file://` scheme or custom protocol faces security restrictions in the webview and does not support HTTP range requests, which browsers require to seek in videos. The video server solves this by binding a standard Axum HTTP server on `127.0.0.1:0` (OS-assigned port) and serving files at `GET /?token=<token>`.

## Details

### Token registry

The server holds a `Registry` — a `Mutex<HashMap<token → PathBuf>>`. It only serves paths that were explicitly registered, so a request cannot name an arbitrary file. `Registry::register(path)` mints a ULID token (via `shared::new_id`) and stores the mapping; registering an already-registered path returns its existing token so re-opening the same file doesn't grow the map. Tokens are generated in `crates/shared` to reuse its existing `ulid` dependency rather than adding one to `src-tauri`.

### Route

```
GET http://127.0.0.1:<port>/?token=<ulid>
```

An unknown or missing token returns `404 NOT FOUND`. The frontend never builds this URL itself: it calls the `get_stream_url(path)` Tauri command, which registers the path and returns the full URL (→ [[wiki/components/frontend]]).

### Range request handling

`resolve_range(spec, file_len) -> Option<(u64, u64)>` computes the inclusive byte range to serve (extracted as a pure function so it is unit-tested):

- **Open-ended request** (`bytes=<start>-`): serves 2 MB starting at `start`. The 2 MB cap supports forward-seeking; an earlier 1 MB cap caused the browser to snap back to the start when the user seeked past a chunk boundary.
- **Explicit range** (`bytes=<start>-<end>`): serves exactly that slice, clamped to end-of-file.
- **Empty file, or `start` past EOF**: returns `None` (the whole-file branch handles it), guarding the `file_len - 1` underflow that a zero-length file would otherwise trigger.
- **No usable range**: serves the entire file.

Responses include `Accept-Ranges: bytes`, `Content-Range`, and correct MIME type. Partial content returns HTTP 206.

### MIME detection

Extension-based: `mp4 → video/mp4`, `mov → video/quicktime`, `mkv → video/x-matroska`, `webm → video/webm`, `avi → video/x-msvideo`. Unknown extensions default to `video/mp4`.

### Threading

File I/O runs in `tokio::task::spawn_blocking` to avoid blocking the async executor.

### Startup

`video_server::start()` is called during `tauri::Builder::setup`. It creates the `Registry`, binds on port 0, spawns the Axum server in the Tauri async runtime, and returns `(port, Arc<Registry>)`. Both are stored in the `VideoServer` managed state, which backs the `get_stream_url` command.

## Decisions & Rationale

Using an ephemeral local HTTP server rather than a Tauri custom protocol because:
1. Standard HTTP with range requests is what browsers expect for `<video>` seeking.
2. Custom protocols in Tauri/WebKitGTK do not relay range headers, so `<video>` seeking broke in practice (→ memory: video-playback-debug).
3. Binding on `127.0.0.1:0` means no fixed port conflict.

The earlier `?path=<absolute_path>` design let any client that could reach localhost read any file the app could read. Because the browser can be induced to send localhost requests (e.g. DNS rebinding from a malicious page), that was a real file-disclosure surface, not just a local-process concern. The token registry closes it: the URL carries an unguessable ULID instead of a path, and only files the app itself opened are reachable.

## Known Issues / Tech Debt

- The registry grows for the lifetime of the process — tokens are never evicted. Fine for a session's worth of opened videos; not bounded.
- File reads are fully buffered into memory for explicit ranges; very large explicit-range requests could spike RAM.

## Related

[[wiki/components/tauri-app]], [[wiki/components/frontend]]
