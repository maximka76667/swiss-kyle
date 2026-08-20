import { ToolPage } from "@/components/tool-page";
import { OutputFolderLink } from "@/components/output-folder-link";
import { DocConverterDropZone } from "@/features/doc-converter/components/doc-converter-drop-zone";
import { ConvertingForm } from "@/features/doc-converter/components/converting-form";
import type { Tool } from "@/types/jobs";
import { useConverterSubmit } from "@/features/doc-converter/hooks/use-converter-submit";

interface Props {
  onJobSubmitted: (
    id: string,
    tool: Tool,
    input: string,
    output: string,
  ) => void;
}

export function DocConverter({ onJobSubmitted }: Props) {
  const { submit } = useConverterSubmit({ onJobSubmitted });

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
        <DocConverterDropZone />
        <ConvertingForm onSubmit={submit} />
      </div>
    </ToolPage>
  );
}
