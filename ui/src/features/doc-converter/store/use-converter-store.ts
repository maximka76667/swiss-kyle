import { create } from "zustand";
import { basename } from "@/lib/utils";
import { OFFICE_EXTENSIONS } from "@/features/doc-converter/constants/file-formats";
import {
  createInputFile,
  getSupportedOutputFormats,
} from "@/features/doc-converter/lib/utils";
import type { DocFormat, InputFile } from "@/features/doc-converter/lib/types";

interface ConverterState {
  inputFile: InputFile | null;
  outputStem: string;
  toFormat: DocFormat;
  setOutputStem: (outputStem: string) => void;
  setToFormat: (toFormat: DocFormat) => void;
  selectFile: (path: string) => void;
}

export const useConverterStore = create<ConverterState>((set, get) => ({
  inputFile: null,
  outputStem: "output",
  toFormat: "pdf",

  setOutputStem: (outputStem) => set({ outputStem }),
  setToFormat: (toFormat) => set({ toFormat }),

  selectFile: (path) => {
    const file = createInputFile(path);
    if (!file) return;
    const stem = basename(file.filePath).replace(/\.[^.]+$/, "");
    const formats = getSupportedOutputFormats(file.extension);
    const { toFormat } = get();
    set({
      inputFile: file,
      outputStem: stem,
      toFormat:
        formats.length > 0 && !formats.includes(toFormat)
          ? formats[0]
          : toFormat,
    });
  },
}));

/** Formats the current input file can be converted to, excluding its own format. */
export function selectAvailableFormats(state: ConverterState): DocFormat[] {
  return state.inputFile
    ? getSupportedOutputFormats(state.inputFile.extension)
    : [];
}

/** Whether the Word-vs-LibreOffice picker applies to the current selection. */
export function selectShowConverter(state: ConverterState): boolean {
  return (
    state.inputFile !== null &&
    OFFICE_EXTENSIONS.has(state.inputFile.extension) &&
    state.toFormat === "pdf"
  );
}
