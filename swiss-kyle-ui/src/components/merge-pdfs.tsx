import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, FileText, FolderOpen, GripVertical, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToolPage } from "@/components/tool-page";
import { cn } from "@/lib/utils";
import { useFileDrop } from "@/hooks/use-file-drop";
import type { Tool } from "@/types/jobs";

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

type PdfEntry = {
  key: string;
  path: string;
  pageCount: number | null | "error";
};

function pageCountLabel(pageCount: PdfEntry["pageCount"]): string {
  if (pageCount === null) return "reading…";
  if (pageCount === "error") return "couldn't read page count";
  return `${pageCount} page${pageCount === 1 ? "" : "s"}`;
}

interface RowProps {
  entry: PdfEntry;
  onRemove: (key: string) => void;
  onMoveUp: (key: string) => void;
  onMoveDown: (key: string) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** Rendered inert inside DragOverlay, where interactive handlers don't apply. */
  overlay?: boolean;
}

function PdfRow({ entry, onRemove, onMoveUp, onMoveDown, canMoveUp, canMoveDown, overlay }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: entry.key, disabled: overlay });

  const style = overlay
    ? undefined
    : {
        transform: CSS.Transform.toString(transform),
        transition,
      };

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-card px-3 py-2",
        isDragging && "opacity-40",
        overlay && "shadow-lg",
      )}
    >
      <GripVertical
        className="h-4 w-4 shrink-0 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        {...(overlay ? {} : { ...attributes, ...listeners })}
      />
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
        <FileText className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium" title={entry.path}>
          {basename(entry.path)}
        </span>
        <span className="text-xs text-muted-foreground">{pageCountLabel(entry.pageCount)}</span>
      </div>
      {!overlay && (
        <div className="flex shrink-0 items-center gap-0.5">
          <div className="flex flex-col">
            <Button
              variant="ghost"
              size="icon-xs"
              className="h-4 text-muted-foreground hover:text-foreground"
              disabled={!canMoveUp}
              title="Move up"
              onClick={() => onMoveUp(entry.key)}
            >
              <ChevronUp className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              className="h-4 text-muted-foreground hover:text-foreground"
              disabled={!canMoveDown}
              title="Move down"
              onClick={() => onMoveDown(entry.key)}
            >
              <ChevronDown className="h-3 w-3" />
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => onRemove(entry.key)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

interface Props {
  onJobSubmitted: (id: string, tool: Tool, input: string, output: string) => void;
}

export function MergePdfs({ onJobSubmitted }: Props) {
  const [entries, setEntries] = useState<PdfEntry[]>([]);
  const [outputStem, setOutputStem] = useState("merged");
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function addPaths(paths: string[]) {
    const pdfs = paths.filter((p) => p.toLowerCase().endsWith(".pdf"));
    const rejected = paths.filter((p) => !p.toLowerCase().endsWith(".pdf"));
    if (rejected.length > 0) {
      toast.error(
        rejected.length === 1
          ? `Not a PDF: ${basename(rejected[0])}`
          : `${rejected.length} files were not PDFs and were skipped`,
      );
    }
    const fresh: PdfEntry[] = pdfs.map((path) => ({
      key: `${path}-${crypto.randomUUID()}`,
      path,
      pageCount: null,
    }));
    if (fresh.length === 0) return;
    setEntries((prev) => [...prev, ...fresh]);
    for (const entry of fresh) {
      invoke<number>("get_pdf_page_count", { path: entry.path })
        .then((pageCount) => {
          setEntries((prev) =>
            prev.map((e) => (e.key === entry.key ? { ...e, pageCount } : e)),
          );
        })
        .catch(() => {
          setEntries((prev) =>
            prev.map((e) => (e.key === entry.key ? { ...e, pageCount: "error" } : e)),
          );
        });
    }
  }

  const { isDragging } = useFileDrop((paths) => addPaths(paths));

  async function pickFiles() {
    const paths = await open({
      multiple: true,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (Array.isArray(paths)) addPaths(paths);
    else if (typeof paths === "string") addPaths([paths]);
  }

  function removeEntry(key: string) {
    setEntries((prev) => prev.filter((e) => e.key !== key));
  }

  function moveEntry(key: string, offset: -1 | 1) {
    setEntries((prev) => {
      const index = prev.findIndex((e) => e.key === key);
      const target = index + offset;
      if (index === -1 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function handleSortStart(e: DragStartEvent) {
    setActiveKey(e.active.id as string);
  }

  function handleSortEnd(e: DragEndEvent) {
    setActiveKey(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setEntries((prev) => {
      const oldIndex = prev.findIndex((entry) => entry.key === active.id);
      const newIndex = prev.findIndex((entry) => entry.key === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  const activeEntry = entries.find((e) => e.key === activeKey) ?? null;

  async function submit() {
    if (entries.length < 2) {
      toast.error("Add at least 2 PDFs to merge");
      return;
    }
    if (!outputStem.trim()) {
      toast.error("Output title cannot be empty");
      return;
    }
    try {
      const id = await invoke<string>("submit_merge_pdfs_job", {
        inputs: entries.map((e) => e.path),
        outputStem: outputStem.trim(),
      });
      onJobSubmitted(id, "merge-pdfs", `${entries.length} PDFs`, `${outputStem.trim()}.pdf`);
      setEntries([]);
    } catch (e) {
      toast.error(`Failed to submit job: ${e}`);
    }
  }

  return (
    <ToolPage
      title="Merge PDFs"
      description={
        <>
          Combine PDFs in the order below. Output is saved to{" "}
          <button
            className="inline-flex items-center gap-1 underline decoration-dotted hover:text-foreground transition-colors"
            onClick={() => invoke("open_output_folder", { subfolder: "merge-pdfs" })}
          >
            <FolderOpen className="h-3 w-3" />
            ~/Documents/swiss-kyle/merge-pdfs/
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-colors",
            isDragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/30 bg-muted/20 hover:bg-muted/30",
          )}
          onClick={pickFiles}
        >
          <Upload className="h-6 w-6 text-muted-foreground" />
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Drag & drop PDFs here</p>
            <p className="mt-1 text-xs text-muted-foreground">or click to browse — add more anytime</p>
          </div>
        </div>

        {entries.length > 0 && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleSortStart}
            onDragEnd={handleSortEnd}
          >
            <SortableContext
              items={entries.map((e) => e.key)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-1.5">
                {entries.map((entry, index) => (
                  <PdfRow
                    key={entry.key}
                    entry={entry}
                    onRemove={removeEntry}
                    onMoveUp={(key) => moveEntry(key, -1)}
                    onMoveDown={(key) => moveEntry(key, 1)}
                    canMoveUp={index > 0}
                    canMoveDown={index < entries.length - 1}
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay>
              {activeEntry && (
                <PdfRow
                  entry={activeEntry}
                  onRemove={removeEntry}
                  onMoveUp={() => {}}
                  onMoveDown={() => {}}
                  canMoveUp={false}
                  canMoveDown={false}
                  overlay
                />
              )}
            </DragOverlay>
          </DndContext>
        )}

        {entries.length > 0 && (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="merge-output-stem">Output title</Label>
              <Input
                id="merge-output-stem"
                value={outputStem}
                onChange={(e) => setOutputStem(e.target.value)}
              />
            </div>

            <Button type="button" onClick={submit} disabled={entries.length < 2}>
              Merge {entries.length > 0 ? `(${entries.length})` : ""}
            </Button>
          </>
        )}
      </div>
    </ToolPage>
  );
}
