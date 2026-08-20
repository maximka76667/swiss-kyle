import { cn } from "@shadcn/lib/utils";
import type { LogEntry } from "@/types/jobs";
import { LOG_LEVEL_CLASS } from "@/features/diagnostics-page/constants/diagnostics";
import { formatTime } from "@/features/diagnostics-page/lib/utils";

export function LogEntryRow({ entry }: { entry: LogEntry }) {
  return (
    <div className="flex items-start gap-2 whitespace-pre-wrap break-words">
      <span className="shrink-0 text-zinc-600">
        {formatTime(entry.timestamp)}
      </span>
      <span
        className={cn(
          "shrink-0 font-semibold",
          LOG_LEVEL_CLASS[entry.level] ?? "text-zinc-300",
        )}
      >
        [{entry.level.toUpperCase()}]
      </span>
      <span className="shrink-0 text-zinc-500" title={entry.job_id}>
        {entry.job_type}:
      </span>
      <span className={LOG_LEVEL_CLASS[entry.level] ?? "text-zinc-300"}>
        {entry.message}
      </span>
    </div>
  );
}
