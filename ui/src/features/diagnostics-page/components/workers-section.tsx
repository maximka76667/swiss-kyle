import type { WorkerRow } from "@/features/diagnostics-page/lib/types";
import { WorkerListRow } from "@/features/diagnostics-page/components/worker-list-row";

export function WorkersSection({
  workers,
  now,
}: {
  workers: WorkerRow[];
  now: number;
}) {
  return (
    <div>
      <h2 className="mb-3 text-base font-semibold">Workers</h2>
      <div className="divide-y divide-border rounded-md border">
        {workers.map((w) => (
          <WorkerListRow key={w.workerId} worker={w} now={now} />
        ))}
      </div>
    </div>
  );
}
