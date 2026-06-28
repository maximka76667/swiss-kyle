use std::process::ExitStatus;

pub fn process_error(name: &str, status: ExitStatus, stderr: &str) -> Box<dyn std::error::Error> {
    let tail: Vec<&str> = stderr
        .lines()
        .filter(|l| !l.trim().is_empty())
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .take(4)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();

    if tail.is_empty() {
        format!("{} failed (exit {})", name, status).into()
    } else {
        format!("{} failed: {}", name, tail.join("\n")).into()
    }
}
