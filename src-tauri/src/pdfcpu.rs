use std::process::Command;

/// Reads a PDF's page count via `pdfcpu info --json`. Blocking — call from a
/// `spawn_blocking` context, not directly on the async runtime.
pub fn page_count(bin: &str, path: &str) -> Result<u32, String> {
    let output = Command::new(bin)
        .arg("info")
        .arg("--json")
        .arg(path)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    let json: serde_json::Value =
        serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())?;
    json["infos"][0]["pageCount"]
        .as_u64()
        .map(|n| n as u32)
        .ok_or_else(|| "pageCount missing from pdfcpu output".to_string())
}
