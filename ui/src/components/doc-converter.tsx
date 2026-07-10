import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToolPage } from "@/components/tool-page";
import { OutputFolderLink } from "@/components/output-folder-link";
import { cn } from "@/lib/utils";
import { useFileDrop } from "@/hooks/use-file-drop";
import type { Tool } from "@/types/jobs";

type DocFormat = "md" | "docx" | "html" | "pdf";
type Converter = "word" | "libreoffice";

const FORMAT_LABEL: Record<DocFormat, string> = {
  md: "Markdown (.md)",
  docx: "Word Document (.docx)",
  html: "HTML (.html)",
  pdf: "PDF (.pdf)",
};

const INPUT_EXT_TO_FORMAT: Record<string, DocFormat> = {
  md: "md",
  markdown: "md",
  docx: "docx",
  doc: "docx",
  odt: "docx",
  rtf: "docx",
  html: "html",
  htm: "html",
};

const OFFICE_EXTS = new Set(["doc", "docx", "odt", "rtf"]);

function outputFormats(inputExt: string): DocFormat[] {
  const inputFmt = INPUT_EXT_TO_FORMAT[inputExt];
  const all: DocFormat[] = ["md", "docx", "html", "pdf"];
  return all.filter((f) => f !== inputFmt);
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

interface Props {
  onJobSubmitted: (id: string, tool: Tool, input: string, output: string) => void;
}

export function DocConverter({ onJobSubmitted }: Props) {
  const [inputPath, setInputPath] = useState<string | null>(null);
  const [inputExt, setInputExt] = useState<string>("");
  const [outputStem, setOutputStem] = useState("output");
  const [toFormat, setToFormat] = useState<DocFormat>("pdf");
  const [converter, setConverter] = useState<Converter>("word");

  const availableFormats = inputExt ? outputFormats(inputExt) : [];
  const showConverter = OFFICE_EXTS.has(inputExt) && toFormat === "pdf";

  function applyFile(path: string) {
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    if (!(ext in INPUT_EXT_TO_FORMAT)) {
      toast.error(`Not a supported document file: ${basename(path)}`, {
        description: `Expected one of: ${Object.keys(INPUT_EXT_TO_FORMAT).map((e) => `.${e}`).join(", ")}`,
      });
      return;
    }
    const stem = basename(path).replace(/\.[^.]+$/, "");
    setInputPath(path);
    setInputExt(ext);
    setOutputStem(stem);
    const formats = outputFormats(ext);
    if (formats.length > 0 && !formats.includes(toFormat)) {
      setToFormat(formats[0]);
    }
  }

  const { isDragging, ready: dropReady } = useFileDrop((paths) => {
    if (paths[0]) applyFile(paths[0]);
  });

  async function pickFile() {
    const path = await open({
      multiple: false,
      filters: [
        {
          name: "Documents",
          extensions: ["md", "markdown", "docx", "doc", "odt", "rtf", "html", "htm"],
        },
      ],
    });
    if (typeof path === "string") applyFile(path);
  }

  async function submit() {
    if (!inputPath) {
      toast.error("Pick a document file first");
      return;
    }
    if (!outputStem.trim()) {
      toast.error("Output title cannot be empty");
      return;
    }
    try {
      const id = await invoke<string>("submit_doc_convert_job", {
        input: inputPath,
        outputStem: outputStem.trim(),
        toFormat,
        converter: showConverter ? converter : null,
      });
      onJobSubmitted(id, "doc-converter", inputPath, `${outputStem.trim()}.${toFormat}`);
    } catch (e) {
      toast.error(`Failed to submit job: ${e}`);
    }
  }

  return (
    <ToolPage
      title="Document Converter"
      description={
        <>
          Convert between Markdown, DOCX, HTML, and PDF. Output is saved to{" "}
          <OutputFolderLink subfolder="convert-document" />
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-12 transition-colors",
            isDragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/30 bg-muted/20 hover:bg-muted/30",
          )}
          data-drop-ready={dropReady}
          onClick={pickFile}
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          {inputPath ? (
            <p className="text-sm font-medium">{basename(inputPath)}</p>
          ) : (
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Drag & drop a document here</p>
              <p className="mt-1 text-xs text-muted-foreground">or click to browse</p>
            </div>
          )}
        </div>

        {inputPath && (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="doc-output-stem">Output title</Label>
              <Input
                id="doc-output-stem"
                value={outputStem}
                onChange={(e) => setOutputStem(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="doc-to-format">Convert to</Label>
              <select
                id="doc-to-format"
                title="Select output format"
                value={toFormat}
                onChange={(e) => setToFormat(e.target.value as DocFormat)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {availableFormats.map((f) => (
                  <option key={f} value={f}>{FORMAT_LABEL[f]}</option>
                ))}
              </select>
            </div>

            {showConverter && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="doc-converter">PDF converter</Label>
                <select
                  id="doc-converter"
                  title="Select PDF converter"
                  value={converter}
                  onChange={(e) => setConverter(e.target.value as Converter)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="word">Microsoft Word (Windows only)</option>
                  <option value="libreoffice">LibreOffice</option>
                </select>
              </div>
            )}

            <Button type="button" onClick={submit}>
              Convert
            </Button>
          </>
        )}
      </div>
    </ToolPage>
  );
}
