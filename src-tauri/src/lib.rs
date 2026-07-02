mod commands;
mod video_server;

use futures::StreamExt;
use shared::{Publisher, StatusEvent, STATUS_SUBJECT};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use video_server::Registry;

struct VideoServer {
    port: u16,
    registry: Arc<Registry>,
}

struct Sidecars(Mutex<Vec<CommandChild>>);

/// Kills any sidecars spawned so far, shows a blocking error dialog, and
/// exits. Startup failures must go through this instead of panicking: a
/// panic in setup() is invisible to the user in a release build (no
/// console), and would leave already-spawned sidecar processes orphaned.
fn fatal(app: &tauri::AppHandle, msg: &str) -> ! {
    log::error!("fatal startup error: {}", msg);
    if let Some(sidecars) = app.try_state::<Sidecars>() {
        for child in sidecars.0.lock().unwrap().drain(..) {
            let _ = child.kill();
        }
    }
    app.dialog()
        .message(msg)
        .kind(MessageDialogKind::Error)
        .title("Swiss Kyle could not start")
        .blocking_show();
    std::process::exit(1);
}

/// Resolves a bundled external binary path.
/// In a production bundle Tauri strips the target-triple suffix and places the
/// binary in the resource directory. In dev mode the script puts it in
/// `src-tauri/binaries/<name>-<triple>`, which lives under the resource dir.
fn resolve_bin(app: &tauri::AppHandle, name: &str) -> Result<String, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Could not resolve the app resource directory: {}", e))?;

    let ext = if cfg!(target_os = "windows") { ".exe" } else { "" };

    let production = resource_dir.join(format!("{}{}", name, ext));
    if production.exists() {
        return Ok(production.to_string_lossy().into_owned());
    }

    let dev = resource_dir
        .join("binaries")
        .join(format!("{}-{}{}", name, env!("TAURI_ENV_TARGET_TRIPLE"), ext));
    if dev.exists() {
        return Ok(dev.to_string_lossy().into_owned());
    }

    Err(format!(
        "Required binary '{}' was not found in {}. The app bundle may be corrupted; try reinstalling.",
        name,
        resource_dir.display()
    ))
}

fn format_command_event(event: CommandEvent) -> String {
    match event {
        CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
            String::from_utf8_lossy(&bytes).trim_end().to_string()
        }
        other => format!("{:?}", other),
    }
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

            // Managed before anything is spawned so fatal() can always clean up.
            app.manage(Sidecars(Mutex::new(Vec::new())));

            let (video_port, video_registry) = video_server::start();
            app.manage(VideoServer {
                port: video_port,
                registry: video_registry,
            });

            let (mut nats_rx, nats_child) = app
                .shell()
                .sidecar("nats-server")
                .and_then(|cmd| cmd.args(["-js", "-D"]).spawn())
                .unwrap_or_else(|e| {
                    fatal(app.handle(), &format!("Failed to start the bundled NATS server: {}", e))
                });
            app.state::<Sidecars>().0.lock().unwrap().push(nats_child);
            tauri::async_runtime::spawn(async move {
                while let Some(event) = nats_rx.recv().await {
                    log::info!("nats-server: {}", format_command_event(event));
                }
            });

            let publisher = tauri::async_runtime::block_on(async {
                let mut last_err = None;
                for _ in 0..40 {
                    match Publisher::connect().await {
                        Ok(publisher) => return Ok(publisher),
                        Err(e) => last_err = Some(e),
                    }
                    tokio::time::sleep(Duration::from_millis(250)).await;
                }
                Err(last_err.expect("40 attempts always set last_err"))
            })
            .unwrap_or_else(|e| {
                fatal(
                    app.handle(),
                    &format!(
                        "Could not connect to the bundled NATS server within 10 seconds \
                         (is another process using port 4222?): {}",
                        e
                    ),
                )
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

            // Jobs are I/O-bound (ffmpeg -c copy) or serialized externally
            // (Word COM, LibreOffice profile lock), so more workers than this
            // only add process overhead.
            let num_workers = std::thread::available_parallelism()
                .map(|n| n.get())
                .unwrap_or(1)
                .min(4);
            log::info!("spawning {} worker(s) (cores, capped at 4)", num_workers);

            let resolve = |name| resolve_bin(app.handle(), name).unwrap_or_else(|e| fatal(app.handle(), &e));
            let ffmpeg_bin = resolve("ffmpeg");
            let pandoc_bin = resolve("pandoc");
            let typst_bin = resolve("typst");
            log::info!("ffmpeg={} pandoc={} typst={}", ffmpeg_bin, pandoc_bin, typst_bin);

            for worker_id in 0..num_workers {
                let (mut worker_rx, worker_child) = app
                    .shell()
                    .sidecar("worker")
                    .and_then(|cmd| {
                        cmd.args([worker_id.to_string()])
                            .env("FFMPEG_BIN", &ffmpeg_bin)
                            .env("PANDOC_BIN", &pandoc_bin)
                            .env("TYPST_BIN", &typst_bin)
                            .spawn()
                    })
                    .unwrap_or_else(|e| {
                        fatal(app.handle(), &format!("Failed to start worker process {}: {}", worker_id, e))
                    });
                tauri::async_runtime::spawn(async move {
                    while let Some(event) = worker_rx.recv().await {
                        log::info!("worker {}: {}", worker_id, format_command_event(event));
                    }
                });
                app.state::<Sidecars>().0.lock().unwrap().push(worker_child);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::submit_cut_job,
            commands::submit_doc_convert_job,
            commands::get_stream_url,
            commands::open_output_folder
        ])
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
