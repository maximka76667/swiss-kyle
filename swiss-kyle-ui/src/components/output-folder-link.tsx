import { FolderOpen } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  subfolder: string;
}

export function OutputFolderLink({ subfolder }: Props) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-primary underline decoration-dotted hover:text-primary/80 transition-colors"
      onClick={() => invoke("open_output_folder", { subfolder })}
    >
      <FolderOpen className="h-3 w-3" />
      ~/Documents/swiss-kyle/{subfolder}/
    </button>
  );
}
