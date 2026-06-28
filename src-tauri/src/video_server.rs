use axum::{body::Body, extract::Query, http::{header, StatusCode}, response::Response, routing::get, Router};
use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom};

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

fn try_build_response(path: &str, range: Option<&str>) -> std::io::Result<Response<Body>> {
    let mut file = std::fs::File::open(path)?;
    let file_len = file.seek(SeekFrom::End(0))?;
    file.seek(SeekFrom::Start(0))?;

    let mime = mime_for(path);

    if let Some(range_val) = range {
        if let Some(bytes) = range_val.strip_prefix("bytes=") {
            if let Some((start_s, end_s)) = bytes.split_once('-') {
                let start: u64 = start_s.parse().unwrap_or(0);
                // For open-ended requests serve 2 MB; for explicit end honour it exactly.
                // The old 1 MB cap on all requests broke forward seeking: the browser
                // couldn't find a keyframe past the truncated chunk and snapped back.
                let end: u64 = if end_s.is_empty() {
                    (start + 2_000_000).min(file_len - 1)
                } else {
                    end_s.parse().unwrap_or(file_len - 1).min(file_len - 1)
                };
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
        }
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

async fn serve_video(
    headers: axum::http::HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Response<Body> {
    let path = match params.get("path") {
        Some(p) => p.clone(),
        None => return Response::builder().status(StatusCode::BAD_REQUEST).body(Body::empty()).unwrap(),
    };

    let range = headers
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    tokio::task::spawn_blocking(move || {
        match try_build_response(&path, range.as_deref()) {
            Ok(r) => r,
            Err(e) => {
                log::error!("video server: failed to serve {}: {}", path, e);
                Response::builder().status(StatusCode::INTERNAL_SERVER_ERROR).body(Body::empty()).unwrap()
            }
        }
    })
    .await
    .unwrap_or_else(|e| {
        log::error!("video server: spawn_blocking panicked: {}", e);
        Response::builder().status(StatusCode::INTERNAL_SERVER_ERROR).body(Body::empty()).unwrap()
    })
}

pub fn start() -> u16 {
    let router = Router::new().route("/", get(serve_video));
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
    port
}
