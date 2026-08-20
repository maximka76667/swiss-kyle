export function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** Formats a time in seconds as a string in the format "MM:SS". It gets rounded down to the nearest second. */
export function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
