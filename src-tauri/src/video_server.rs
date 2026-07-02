use axum::{
    body::Body,
    extract::{Query, State},
    http::{header, StatusCode},
    response::Response,
    routing::get,
    Router,
};
use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

/// Maps opaque tokens to file paths. The server only serves registered paths,
/// so a drive-by web page (via DNS rebinding) or another local process can't
/// use it to read arbitrary files on disk — only files the app itself opened.
#[derive(Default)]
pub struct Registry(Mutex<HashMap<String, PathBuf>>);

impl Registry {
    /// Registers a path and returns the token to stream it with. A path that
    /// is already registered keeps its existing token, so re-opening the same
    /// file doesn't grow the map.
    pub fn register(&self, path: PathBuf) -> String {
        let mut tokens = self.0.lock().unwrap();
        if let Some(token) = tokens.iter().find(|(_, p)| **p == path).map(|(t, _)| t) {
            return token.clone();
        }
        let token = shared::new_id();
        tokens.insert(token.clone(), path);
        token
    }

    fn get(&self, token: &str) -> Option<PathBuf> {
        self.0.lock().unwrap().get(token).cloned()
    }
}

fn mime_for(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or("").to_lowercase().as_str() {
        "mp4" => "video/mp4",
        "mov" => "video/quicktime",
        "mkv" => "video/x-matroska",
        "webm" => "video/webm",
        "avi" => "video/x-msvideo",
        _ => "video/mp4",
    }
}

/// Resolves a Range header value to the inclusive byte range to serve, or None
/// when there's no usable range and the whole file should be sent. For
/// open-ended requests serve 2 MB; for an explicit end honour it exactly. A
/// blanket 1 MB cap on all requests would break forward seeking: the browser
/// couldn't find a keyframe past the truncated chunk and would snap back.
fn resolve_range(spec: &str, file_len: u64) -> Option<(u64, u64)> {
    if file_len == 0 {
        return None;
    }
    let (start_s, end_s) = spec.strip_prefix("bytes=")?.split_once('-')?;
    let start: u64 = start_s.parse().unwrap_or(0);
    let end: u64 = if end_s.is_empty() {
        start + 2_000_000
    } else {
        end_s.parse().unwrap_or(file_len - 1)
    };
    let end = end.min(file_len - 1);
    if start > end {
        return None;
    }
    Some((start, end))
}

fn try_build_response(path: &Path, range: Option<&str>) -> std::io::Result<Response<Body>> {
    let mut file = std::fs::File::open(path)?;
    let file_len = file.seek(SeekFrom::End(0))?;
    file.seek(SeekFrom::Start(0))?;

    let mime = mime_for(&path.to_string_lossy());

    if let Some((start, end)) = range.and_then(|spec| resolve_range(spec, file_len)) {
        let chunk = (end - start + 1) as usize;

        file.seek(SeekFrom::Start(start))?;
        let mut buf = vec![0u8; chunk];
        file.read_exact(&mut buf)?;

        return Ok(Response::builder()
            .status(StatusCode::PARTIAL_CONTENT)
            .header(header::CONTENT_TYPE, mime)
            .header(header::CONTENT_LENGTH, chunk.to_string())
            .header(header::ACCEPT_RANGES, "bytes")
            .header(header::CONTENT_RANGE, format!("bytes {}-{}/{}", start, end, file_len))
            .body(Body::from(buf))
            .unwrap());
    }

    let mut buf = Vec::new();
    file.read_to_end(&mut buf)?;
    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime)
        .header(header::CONTENT_LENGTH, file_len.to_string())
        .header(header::ACCEPT_RANGES, "bytes")
        .body(Body::from(buf))
        .unwrap())
}

fn empty_response(status: StatusCode) -> Response<Body> {
    Response::builder().status(status).body(Body::empty()).unwrap()
}

async fn serve_video(
    State(registry): State<Arc<Registry>>,
    headers: axum::http::HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Response<Body> {
    let path = match params.get("token").and_then(|t| registry.get(t)) {
        Some(p) => p,
        None => return empty_response(StatusCode::NOT_FOUND),
    };

    let range = headers
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    tokio::task::spawn_blocking(move || {
        match try_build_response(&path, range.as_deref()) {
            Ok(r) => r,
            Err(e) => {
                log::error!("video server: failed to serve {}: {}", path.display(), e);
                empty_response(StatusCode::INTERNAL_SERVER_ERROR)
            }
        }
    })
    .await
    .unwrap_or_else(|e| {
        log::error!("video server: spawn_blocking panicked: {}", e);
        empty_response(StatusCode::INTERNAL_SERVER_ERROR)
    })
}

pub fn start() -> (u16, Arc<Registry>) {
    let registry = Arc::new(Registry::default());
    let router = Router::new()
        .route("/", get(serve_video))
        .with_state(registry.clone());
    let (listener, port) = tauri::async_runtime::block_on(async {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("failed to bind video server");
        let port = listener.local_addr().expect("failed to get video server port").port();
        (listener, port)
    });
    log::info!("video server on port {}", port);
    tauri::async_runtime::spawn(async move {
        if let Err(e) = axum::serve(listener, router).await {
            log::error!("video server crashed: {}", e);
        }
    });
    (port, registry)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mime_for_known_and_unknown() {
        assert_eq!(mime_for("clip.mp4"), "video/mp4");
        assert_eq!(mime_for("CLIP.MOV"), "video/quicktime");
        assert_eq!(mime_for("a.mkv"), "video/x-matroska");
        assert_eq!(mime_for("noext"), "video/mp4");
    }

    #[test]
    fn resolve_range_empty_file_is_none() {
        assert_eq!(resolve_range("bytes=0-", 0), None);
    }

    #[test]
    fn resolve_range_open_ended_caps_at_2mb() {
        assert_eq!(resolve_range("bytes=0-", 10_000_000), Some((0, 2_000_000)));
    }

    #[test]
    fn resolve_range_open_ended_near_eof_clamps() {
        assert_eq!(resolve_range("bytes=100-", 500), Some((100, 499)));
    }

    #[test]
    fn resolve_range_explicit_end_honoured_and_clamped() {
        assert_eq!(resolve_range("bytes=100-200", 1000), Some((100, 200)));
        assert_eq!(resolve_range("bytes=100-99999", 1000), Some((100, 999)));
    }

    #[test]
    fn resolve_range_start_past_eof_is_none() {
        assert_eq!(resolve_range("bytes=5000-", 1000), None);
    }

    #[test]
    fn resolve_range_malformed_is_none() {
        assert_eq!(resolve_range("junk", 1000), None);
        assert_eq!(resolve_range("bytes=abc", 1000), None);
    }

    #[test]
    fn registry_reuses_token_for_same_path() {
        let reg = Registry::default();
        let a = reg.register(PathBuf::from("/tmp/x.mp4"));
        let b = reg.register(PathBuf::from("/tmp/x.mp4"));
        assert_eq!(a, b);
        assert_eq!(reg.get(&a), Some(PathBuf::from("/tmp/x.mp4")));
    }

    #[test]
    fn registry_rejects_unknown_token() {
        let reg = Registry::default();
        assert_eq!(reg.get("nope"), None);
    }
}
