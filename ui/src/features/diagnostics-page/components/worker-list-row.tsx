import { Loader2 } from "lucide-react";
import { cn } from "@shadcn/lib/utils";
import type { WorkerRow } from "@/features/diagnostics-page/lib/types";
import {
  formatTime,
  workerRowDisplay,
} from "@/features/diagnostics-page/lib/utils";

export function WorkerListRow({
  worker,
  now,
}: {
  worker: WorkerRow;
  now: number;
}) {
  const { label, dotColor, unknown, isError, offline } = workerRowDisplay(
    worker,
    now,
  );

  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <span className="flex h-2 w-2 shrink-0 items-center justify-center">
        {unknown ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        ) : (
          <span className={cn("h-2 w-2 rounded-full", dotColor)} />
        )}
      </span>
      <span className="w-20 shrink-0 text-sm font-medium">
        Worker {worker.workerId}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-sm",
          isError && !offline && !unknown
            ? "text-red-500"
            : "text-muted-foreground",
        )}
        title={label}
      >
        {label}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {worker.timestamp
          ? `last fetched ${formatTime(worker.timestamp)}`
          : "—"}
      </span>
    </div>
  );
}
