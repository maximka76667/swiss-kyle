import { ToolPage } from "@/components/tool-page";
import { OutputFolderLink } from "@/components/output-folder-link";
import { DocConverterDropZone } from "@/features/doc-converter/components/doc-converter-drop-zone";
import { ConvertingForm } from "@/features/doc-converter/components/converting-form";
import type { Tool } from "@/types/jobs";
import { useConverterForm } from "@/features/doc-converter/hooks/use-converter-form";
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
  } = useConverterForm();

  const { submit } = useConverterSubmit({
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
        <DocConverterDropZone
          inputPath={inputPath}
          validate={validate}
          onFile={applyFile}
        />
        <ConvertingForm
          inputPath={inputPath}
          outputStem={outputStem}
          setOutputStem={setOutputStem}
          toFormat={toFormat}
          setToFormat={setToFormat}
          availableFormats={availableFormats}
          showConverter={showConverter}
          converter={converter}
          setConverter={setConverter}
          onSubmit={submit}
        />
      </div>
    </ToolPage>
  );
}
