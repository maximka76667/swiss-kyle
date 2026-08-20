import { useAppVersion } from "@/hooks/use-app-version";
import { useWorkerRows } from "@/features/diagnostics-page/hooks/use-worker-rows";
import { useJobLogs } from "@/features/diagnostics-page/hooks/use-job-logs";
import { DiagnosticsHeader } from "@/features/diagnostics-page/components/diagnostics-header";
import { WorkersSection } from "@/features/diagnostics-page/components/workers-section";
import { JobLogSection } from "@/features/diagnostics-page/components/job-log-section";

export function DiagnosticsPage() {
  const version = useAppVersion();
  const { workerRows, now } = useWorkerRows();
  const logs = useJobLogs();

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <DiagnosticsHeader version={version} />
      <WorkersSection workers={workerRows} now={now} />
      <JobLogSection logs={logs} />
    </div>
  );
}
