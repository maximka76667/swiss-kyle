import { useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFileDrop } from "@/hooks/use-file-drop";

interface ValidationResult {
  accepted: string[];
  reject?: { message: string; description?: string };
}

interface Props {
  multiple: boolean;
  dialogFilter: { name: string; extensions: string[] };
  /** Partitions raw paths (from a drop or the native picker) into what to accept and an optional rejection toast. */
  validate: (paths: string[]) => ValidationResult;
  onFiles: (paths: string[]) => void;
  prompt: string;
  hint: string;
  /** Shown instead of the icon+prompt once set. Omit to always show the prompt — for tools (like Merge PDFs) that list selections elsewhere. */
  selectedLabel?: string | null;
  iconClassName?: string;
  className?: string;
}

export function FileDropZone({
  multiple,
  dialogFilter,
  validate,
  onFiles,
  prompt,
  hint,
  selectedLabel,
  iconClassName = "h-8 w-8",
  className,
}: Props) {
  const handlePaths = useCallback(
    (paths: string[]) => {
      const { accepted, reject } = validate(paths);
      if (reject) {
        toast.error(
          reject.message,
          reject.description ? { description: reject.description } : undefined,
        );
      }
      if (accepted.length > 0) onFiles(accepted);
    },
    [validate, onFiles],
  );

  const { isDragging, ready: dropReady } = useFileDrop(handlePaths);

  async function pickFiles() {
    const result = await open({ multiple, filters: [dialogFilter] });
    if (result === null) return;
    handlePaths(Array.isArray(result) ? result : [result]);
  }

  return (
    <div
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-12 transition-colors",
        isDragging
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/30 bg-muted/20 hover:bg-muted/30",
        className,
      )}
      data-drop-ready={dropReady}
      onClick={pickFiles}
    >
      <Upload className={cn("text-muted-foreground", iconClassName)} />
      {selectedLabel ? (
        <p className="text-sm font-medium">{selectedLabel}</p>
      ) : (
        <div className="text-center">
          <p className="text-sm text-muted-foreground">{prompt}</p>
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </div>
      )}
    </div>
  );
}
