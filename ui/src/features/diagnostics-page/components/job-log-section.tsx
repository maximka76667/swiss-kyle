import { ScrollArea } from "@shadcn/components/ui/scroll-area";
import type { LogEntry } from "@/types/jobs";
import { LogEntryRow } from "@/features/diagnostics-page/components/log-entry-row";

export function JobLogSection({ logs }: { logs: LogEntry[] }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h2 className="mb-3 text-base font-semibold">Job Log</h2>
      <div className="min-h-0 flex-1 overflow-hidden rounded-md bg-zinc-950">
        {logs.length === 0 ? (
          <p className="p-3 font-mono text-xs text-zinc-500">
            No log entries yet
          </p>
        ) : (
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-0.5 p-3 font-mono text-xs leading-relaxed">
              {logs.map((entry, i) => (
                <LogEntryRow key={i} entry={entry} />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
