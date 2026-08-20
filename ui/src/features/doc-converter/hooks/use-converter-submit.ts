import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import type { Tool } from "@/types/jobs";
import type { DocFormat, Converter } from "@/features/doc-converter/lib/types";

interface UseDocConverterSubmitArgs {
  inputPath: string | null;
  outputStem: string;
  toFormat: DocFormat;
  converter: Converter;
  showConverter: boolean;
  onJobSubmitted: (
    id: string,
    tool: Tool,
    input: string,
    output: string,
  ) => void;
}

/** Submits the current doc-converter selection as a conversion job. */
export function useConverterSubmit({
  inputPath,
  outputStem,
  toFormat,
  converter,
  showConverter,
  onJobSubmitted,
}: UseDocConverterSubmitArgs) {
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
      onJobSubmitted(
        id,
        "doc-converter",
        inputPath,
        `${outputStem.trim()}.${toFormat}`,
      );
    } catch (e) {
      toast.error(`Failed to submit job: ${e}`);
    }
  }

  return { submit };
}
