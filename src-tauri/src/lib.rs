use futures::StreamExt;
use shared::{CutVideo, Job, JobEnvelope, Publisher, StatusEvent, STATUS_SUBJECT};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Emitter, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

struct Sidecars(Mutex<Vec<CommandChild>>);

fn format_command_event(event: CommandEvent) -> String {
    match event {
        CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
            String::from_utf8_lossy(&bytes).trim_end().to_string()
        }
        other => format!("{:?}", other),
    }
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

            // Sidecar spawn is non-blocking, so the broker needs a moment to
            // start listening before we can connect.
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

            let mut children = vec![nats_child];
            for worker_id in 0..num_workers {
                let (mut worker_rx, worker_child) = app
                    .shell()
                    .sidecar("worker")?
                    .args([worker_id.to_string()])
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
        .invoke_handler(tauri::generate_handler![submit_cut_job])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                if let Some(sidecars) = app_handle.try_state::<Sidecars>() {
                    for child in sidecars.0.lock().unwrap().drain(..) {
                        let _ = child.kill();
                    }
                }
            }
        });
}
