import { EXTENSION_TO_FORMAT } from "@/features/doc-converter/constants/file-formats";
import type {
  DocFormat,
  InputExtension,
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
