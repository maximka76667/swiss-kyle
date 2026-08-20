import { Button } from "@shadcn/components/ui/button";
import { Label } from "@shadcn/components/ui/label";
import { ToolPage } from "@/components/tool-page";
import { OutputFolderLink } from "@/components/output-folder-link";
import { FileDropZone } from "@/components/file-drop-zone";
import { OutputTitleField } from "@/components/output-title-field";
import { basename } from "@/lib/utils";
import type { Tool } from "@/types/jobs";
import type { DocFormat, Converter } from "@/features/doc-converter/lib/types";
import {
  FORMAT_LABEL,
  INPUT_EXT_TO_FORMAT,
} from "@/features/doc-converter/constants/file-formats";
import { useDocConverterForm } from "@/features/doc-converter/hooks/use-doc-converter-form";
import { useDocConverterSubmit } from "@/features/doc-converter/hooks/use-doc-converter-submit";

interface Props {
  onJobSubmitted: (
    id: string,
    tool: Tool,
    input: string,
    output: string,
  ) => void;
}

export function DocConverter({ onJobSubmitted }: Props) {
  const {
    inputPath,
    outputStem,
    setOutputStem,
    toFormat,
    setToFormat,
    converter,
    setConverter,
    availableFormats,
    showConverter,
    applyFile,
    validate,
  } = useDocConverterForm();

  const { submit } = useDocConverterSubmit({
    inputPath,
    outputStem,
    toFormat,
    converter,
    showConverter,
    onJobSubmitted,
  });

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
        <FileDropZone
          multiple={false}
          dialogFilter={{
            name: "Documents",
            extensions: Object.keys(INPUT_EXT_TO_FORMAT),
          }}
          validate={validate}
          onFiles={([path]) => applyFile(path)}
          prompt="Drag & drop a document here"
          hint="or click to browse"
          selectedLabel={inputPath ? basename(inputPath) : null}
        />

        {inputPath && (
          <>
            <OutputTitleField
              id="doc-output-stem"
              value={outputStem}
              onChange={setOutputStem}
            />

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
                  <option key={f} value={f}>
                    {FORMAT_LABEL[f]}
                  </option>
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
