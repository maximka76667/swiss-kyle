import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";

/** Resolves to the running app's version (from tauri.conf.json), or null until it loads. */
export function useAppVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    getVersion().then(setVersion);
  }, []);

  return version;
}
