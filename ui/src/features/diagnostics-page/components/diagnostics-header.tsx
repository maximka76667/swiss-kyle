export function DiagnosticsHeader({ version }: { version: string | null }) {
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-lg font-semibold">Diagnostics</h1>
      {version && (
        <span className="text-xs text-muted-foreground">
          Swiss Kyle v{version}
        </span>
      )}
    </div>
  );
}
