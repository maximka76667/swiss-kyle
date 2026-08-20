import { basename } from "@/lib/utils";
import { EXTENSION_TO_FORMAT } from "@/features/doc-converter/constants/file-formats";
import type {
  DocFormat,
  InputExtension,
  InputFile,
} from "@/features/doc-converter/lib/types";

/** Lists the formats `inputExtension` can be converted to, excluding its own format. */
export function getSupportedOutputFormats(
  inputExtension: InputExtension,
): DocFormat[] {
  const inputFmt = EXTENSION_TO_FORMAT[inputExtension];
  const all: DocFormat[] = ["md", "docx", "html", "pdf"];
  return all.filter((f) => f !== inputFmt);
}

export function isSupportedInputExtension(
  extension: string,
): extension is InputExtension {
  return extension in EXTENSION_TO_FORMAT;
}

/** Derives an InputFile from a raw file path, or null if its extension isn't supported. */
export function createInputFile(filePath: string): InputFile | null {
  const extension = filePath.split(".").pop()?.toLowerCase() ?? "";
  if (!isSupportedInputExtension(extension)) return null;
  return { filePath, extension };
}

/** FileDropZone's `validate` prop: accepts paths whose extension is supported. */
export function validateInputFile(paths: string[]): {
  accepted: string[];
  reject?: { message: string; description?: string };
} {
  const path = paths[0];
  if (!createInputFile(path)) {
    return {
      accepted: [],
      reject: {
        message: `Not a supported document file: ${basename(path)}`,
        description: `Expected one of: ${Object.keys(EXTENSION_TO_FORMAT)
          .map((e) => `.${e}`)
          .join(", ")}`,
      },
    };
  }
  return { accepted: [path] };
}
