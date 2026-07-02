mod video_server;

use futures::StreamExt;
use shared::{base_output_dir, Converter, ConvertDocument, DocFormat, CutVideo, Job, JobEnvelope, Publisher, StatusEvent, STATUS_SUBJECT};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Emitter, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use video_server::Registry;

struct VideoServer {
    port: u16,
    registry: Arc<Registry>,
}

struct Sidecars(Mutex<Vec<CommandChild>>);

/// Resolves a bundled external binary path.
/// In a production bundle Tauri strips the target-triple suffix and places the
/// binary in the resource directory. In dev mode the script puts it in
/// `src-tauri/binaries/<name>-<triple>`, which lives under the resource dir.
/// Falls back to the bare name so the OS PATH is used if neither is found.

fn resolve_bin(app: &tauri::AppHandle, name: &str) -> String {
    let Ok(resource_dir) = app.path().resource_dir() else {
        return name.to_string();
    };

    let ext = if cfg!(target_os = "windows") { ".exe" } else { "" };

    let production = resource_dir.join(format!("{}{}", name, ext));
    if production.exists() {
        return production.to_string_lossy().into_owned();
    }

    let dev = resource_dir
        .join("binaries")
        .join(format!("{}-{}{}", name, env!("TAURI_ENV_TARGET_TRIPLE"), ext));
    if dev.exists() {
        return dev.to_string_lossy().into_owned();
    }

    panic!("sidecar binary '{}' not found in resource dir {:?}", name, resource_dir)
}

fn format_command_event(event: CommandEvent) -> String {
    match event {
        CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
            String::from_utf8_lossy(&bytes).trim_end().to_string()
        }
        other => format!("{:?}", other),
    }
}

/// Registers `path` with the video server and returns a URL that streams it.
/// The URL carries an unguessable token, not the path, so the server never
/// exposes arbitrary files on disk.
#[tauri::command]
fn get_stream_url(server: tauri::State<'_, VideoServer>, path: String) -> String {
    let token = server.registry.register(path.into());
    format!("http://127.0.0.1:{}/?token={}", server.port, token)
}

#[tauri::command]
fn open_output_folder(subfolder: String) -> Result<(), String> {
    let path = if subfolder.is_empty() {
        base_output_dir()
    } else {
        shared::output_dir(&subfolder)
    };
    std::fs::create_dir_all(&path).ok();
    let opener = if cfg!(target_os = "macos") { "open" } else if cfg!(target_os = "windows") { "explorer" } else { "xdg-open" };
    std::process::Command::new(opener).arg(&path).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn submit_doc_convert_job(
    publisher: tauri::State<'_, Publisher>,
    input: String,
    output_stem: String,
    to_format: String,
    converter: Option<String>,
) -> Result<String, String> {
    let to_format = match to_format.as_str() {
        "md" => DocFormat::Markdown,
        "docx" => DocFormat::Docx,
        "html" => DocFormat::Html,
        "pdf" => DocFormat::Pdf,
        other => return Err(format!("unknown format: {}", other)),
    };
    let converter = match converter.as_deref() {
        Some("word") => Some(Converter::Word),
        Some("libreoffice") | None => Some(Converter::LibreOffice),
        Some(other) => return Err(format!("unknown converter: {}", other)),
    };
    let job = JobEnvelope::new(Job::ConvertDocument(ConvertDocument { input, output_stem, to_format, converter }));
    publisher.publish(&job).await.map_err(|e| e.to_string())?;
    Ok(job.id)
}

#[tauri::command]
async fn submit_cut_job(
    publisher: tauri::State<'_, Publisher>,
    input: String,
    output: String,
    start_secs: f64,
    end_secs: f64,
) -> Result<String, String> {
    let job = JobEnvelope::new(Job::CutVideo(CutVideo {
        input,
        output,
        start_secs,
        end_secs,
    }));
    publisher.publish(&job).await.map_err(|e| e.to_string())?;
    Ok(job.id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let (video_port, video_registry) = video_server::start();
            app.manage(VideoServer {
                port: video_port,
                registry: video_registry,
            });

            let (mut nats_rx, nats_child) = app
                .shell()
                .sidecar("nats-server")?
                .args(["-js", "-D"])
                .spawn()
                .expect("failed to spawn nats-server sidecar");
            tauri::async_runtime::spawn(async move {
                while let Some(event) = nats_rx.recv().await {
                    log::info!("nats-server: {}", format_command_event(event));
                }
            });

            let publisher = tauri::async_runtime::block_on(async {
                for _ in 0..40 {
                    if let Ok(publisher) = Publisher::connect().await {
                        return publisher;
                    }
                    tokio::time::sleep(Duration::from_millis(250)).await;
                }
                panic!("failed to connect to NATS sidecar after 10s");
            });
            let status_client = publisher.client().clone();
            app.manage(publisher);

            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut subscriber = match status_client.subscribe(STATUS_SUBJECT).await {
                    Ok(s) => s,
                    Err(e) => {
                        log::error!("failed to subscribe to job status: {:?}", e);
                        return;
                    }
                };
                while let Some(message) = subscriber.next().await {
                    match serde_json::from_slice::<StatusEvent>(&message.payload) {
                        Ok(event) => {
                            let _ = app_handle.emit("job-status", event);
                        }
                        Err(e) => log::error!("failed to deserialize status event: {:?}", e),
                    }
                }
            });

            let num_workers = std::thread::available_parallelism()
                .map(|n| n.get())
                .unwrap_or(1);
            log::info!("spawning {} worker(s), one per CPU core", num_workers);

            let ffmpeg_bin = resolve_bin(app.handle(), "ffmpeg");
            let pandoc_bin = resolve_bin(app.handle(), "pandoc");
            let typst_bin = resolve_bin(app.handle(), "typst");
            log::info!("ffmpeg={} pandoc={} typst={}", ffmpeg_bin, pandoc_bin, typst_bin);

            let mut children = vec![nats_child];
            for worker_id in 0..num_workers {
                let (mut worker_rx, worker_child) = app
                    .shell()
                    .sidecar("worker")?
                    .args([worker_id.to_string()])
                    .env("FFMPEG_BIN", &ffmpeg_bin)
                    .env("PANDOC_BIN", &pandoc_bin)
                    .env("TYPST_BIN", &typst_bin)
                    .spawn()
                    .expect("failed to spawn worker sidecar");
                tauri::async_runtime::spawn(async move {
                    while let Some(event) = worker_rx.recv().await {
                        log::info!("worker {}: {}", worker_id, format_command_event(event));
                    }
                });
                children.push(worker_child);
            }

            app.manage(Sidecars(Mutex::new(children)));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![submit_cut_job, submit_doc_convert_job, get_stream_url, open_output_folder])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            match event {
                tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
                    if let Some(sidecars) = app_handle.try_state::<Sidecars>() {
                        for child in sidecars.0.lock().unwrap().drain(..) {
                            let _ = child.kill();
                        }
                    }
                }
                _ => {}
            }
        });
}
