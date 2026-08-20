import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import type { Tool } from "@/types/jobs";
import type { Converter } from "@/features/doc-converter/lib/types";
import {
  useConverterStore,
  selectShowConverter,
} from "@/features/doc-converter/store/use-converter-store";

interface UseConverterSubmitArgs {
  onJobSubmitted: (
    id: string,
    tool: Tool,
    input: string,
    output: string,
  ) => void;
}

/** Submits the current doc-converter selection as a conversion job. */
export function useConverterSubmit({ onJobSubmitted }: UseConverterSubmitArgs) {
  async function submit(converter: Converter) {
    const { inputFile, outputStem, toFormat } = useConverterStore.getState();
    const showConverter = selectShowConverter(useConverterStore.getState());

    if (!inputFile) {
      toast.error("Pick a document file first");
      return;
    }

    if (!outputStem.trim()) {
      toast.error("Output title cannot be empty");
      return;
    }

    try {
      const id = await invoke<string>("submit_doc_convert_job", {
        input: inputFile.filePath,
        outputStem: outputStem.trim(),
        toFormat,
        converter: showConverter ? converter : null,
      });
      onJobSubmitted(
        id,
        "doc-converter",
        inputFile.filePath,
        `${outputStem.trim()}.${toFormat}`,
      );
    } catch (e) {
      toast.error(`Failed to submit job: ${e}`);
    }
  }

  return { submit };
}
