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

pub(crate) struct PdfcpuBin(pub String);

/// Kills any sidecars spawned so far, shows a blocking error dialog, and
/// exits. Startup failures must go through this instead of panicking: a
/// panic in setup() is invisible to the user in a release build (no
/// console), and would leave already-spawned sidecar processes orphaned.
///
/// tauri_plugin_dialog is configured with the `xdg-portal` feature (see
/// Cargo.toml) instead of its default `gtk` backend: the gtk backend hangs
/// with nothing shown when called from setup() on Linux, since it needs our
/// own process's GTK event loop already running, which it isn't yet at this
/// point. xdg-portal asks a system service (over DBus) to show the dialog
/// instead, so it doesn't depend on our process's loop at all.
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

/// Resolves the absolute path to a bundled tool declared in `bundle.resources`
/// (tauri.conf.json). Tauri places these under `resource_dir()/bin/` - a
/// private, per-app directory (e.g. /usr/lib/swiss-kyle/bin on Linux) that
/// never touches shared system paths, unlike `externalBin`/sidecars, which
/// Tauri's .deb bundler places directly in /usr/bin and can collide with
/// real system packages (e.g. ffmpeg). Only used for tools invoked by the
/// `worker` process (ffmpeg, pandoc, typst, pdfcpu) - `nats-server`/`worker`
/// are spawned directly by this app via `app.shell().sidecar()` instead,
/// since their names don't collide with anything.
fn resolve_bin(app: &tauri::AppHandle, name: &str) -> Result<String, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Could not resolve the app resource directory: {}", e))?;
    let ext = if cfg!(target_os = "windows") { ".exe" } else { "" };
    let path = resource_dir
        .join("bin")
        .join(format!("{}-{}{}", name, env!("TAURI_ENV_TARGET_TRIPLE"), ext));
    if !path.exists() {
        return Err(format!(
            "Required binary '{}' was not found at {}. The app bundle may be corrupted; try reinstalling.",
            name,
            path.display()
        ));
    }
    Ok(path.to_string_lossy().into_owned())
}

fn format_command_event(event: CommandEvent) -> String {
    match event {
        CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
            String::from_utf8_lossy(&bytes).trim_end().to_string()
        }
        other => format!("{:?}", other),
    }
}

/// Path to the file that tracks PIDs of sidecars spawned by this app, so a
/// future launch (after a crash that skipped normal cleanup) can find and
/// verify them. Lives next to the sidecar binaries themselves (resource_dir/bin,
/// the same place `resolve_bin` and the `resources` bundle config put them).
fn sidecar_pid_file(resource_dir: &std::path::Path) -> std::path::PathBuf {
    resource_dir.join("bin").join(".sidecar-pids")
}

/// Kills sidecars left running by a previous, abnormally-terminated launch.
/// A PID is only killed if it's still alive AND its executable path resolves
/// inside our own resource directory - never killed on name/pattern alone.
fn kill_leftover_sidecars(app: &tauri::AppHandle) {
    let Ok(resource_dir) = app.path().resource_dir() else { return };
    let pid_file = sidecar_pid_file(&resource_dir);
    let Ok(contents) = std::fs::read_to_string(&pid_file) else { return };

    let mut sys = sysinfo::System::new();
    for line in contents.lines() {
        let Ok(pid) = line.trim().parse::<usize>() else { continue };
        let pid = sysinfo::Pid::from(pid);
        sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[pid]), true);
        let Some(process) = sys.process(pid) else { continue };
        let belongs_to_us = process.exe().is_some_and(|exe| exe.starts_with(&resource_dir));
        if belongs_to_us {
            log::info!("killing leftover sidecar process from a previous run: {}", pid);
            process.kill();
        } else {
            log::warn!("PID {} in stale sidecar pidfile no longer matches our binaries, skipping", pid);
        }
    }
    let _ = std::fs::remove_file(&pid_file);
}

/// Records the PIDs of all currently-managed sidecars so a future launch can
/// clean them up if this run doesn't exit cleanly.
fn write_sidecar_pids(app: &tauri::AppHandle) {
    let Ok(resource_dir) = app.path().resource_dir() else { return };
    let Some(sidecars) = app.try_state::<Sidecars>() else { return };
    let pids: String = sidecars.0.lock().unwrap().iter().map(|c| format!("{}\n", c.pid())).collect();
    let _ = std::fs::write(sidecar_pid_file(&resource_dir), pids);
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

            // Clean up sidecars orphaned by a previous run that didn't exit
            // cleanly (crash, force-kill) before spawning fresh ones.
            kill_leftover_sidecars(app.handle());

            let (video_port, video_registry) = video_server::start();
            app.manage(VideoServer {
                port: video_port,
                registry: video_registry,
            });

            let nats_server_bin = resolve_bin(app.handle(), "nats-server")
                .unwrap_or_else(|e| fatal(app.handle(), &e));
            let (mut nats_rx, nats_child) = app
                .shell()
                .command(nats_server_bin)
                .args(["-js", "-D"])
                .spawn()
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
            let pdfcpu_bin = resolve("pdfcpu");
            log::info!(
                "ffmpeg={} pandoc={} typst={} pdfcpu={}",
                ffmpeg_bin, pandoc_bin, typst_bin, pdfcpu_bin
            );
            app.manage(PdfcpuBin(pdfcpu_bin.clone()));

            let worker_bin = resolve("worker");
            for worker_id in 0..num_workers {
                let (mut worker_rx, worker_child) = app
                    .shell()
                    .command(&worker_bin)
                    .args([worker_id.to_string()])
                    .env("FFMPEG_BIN", &ffmpeg_bin)
                    .env("PANDOC_BIN", &pandoc_bin)
                    .env("TYPST_BIN", &typst_bin)
                    .env("PDFCPU_BIN", &pdfcpu_bin)
                    .spawn()
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

            write_sidecar_pids(app.handle());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::submit_cut_job,
            commands::submit_doc_convert_job,
            commands::submit_merge_pdfs_job,
            commands::get_pdf_page_count,
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
                    if let Ok(resource_dir) = app_handle.path().resource_dir() {
                        let _ = std::fs::remove_file(sidecar_pid_file(&resource_dir));
                    }
                }
                _ => {}
            }
        });
}
