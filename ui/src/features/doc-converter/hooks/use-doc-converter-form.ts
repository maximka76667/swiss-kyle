import { useState } from "react";
import { basename } from "@/lib/utils";
import {
  INPUT_EXT_TO_FORMAT,
  OFFICE_EXTS,
} from "@/features/doc-converter/constants/file-formats";
import {
  getSupportedOutputFormats,
  isSupportedInputExtension,
} from "@/features/doc-converter/lib/utils";
import type {
  DocFormat,
  Converter,
  InputExtension,
} from "@/features/doc-converter/lib/types";

/** Owns the selected file, target format, and converter choice for the doc-converter form. */
export function useDocConverterForm() {
  const [inputPath, setInputPath] = useState<string | null>(null);
  const [inputExtension, setInputExtension] = useState<InputExtension | null>(
    null,
  );
  const [outputStem, setOutputStem] = useState("output");
  const [toFormat, setToFormat] = useState<DocFormat>("pdf");
  const [converter, setConverter] = useState<Converter>("word");

  const availableFormats = inputExtension
    ? getSupportedOutputFormats(inputExtension)
    : [];
  const showConverter =
    inputExtension !== null &&
    OFFICE_EXTS.has(inputExtension) &&
    toFormat === "pdf";

  function applyFile(path: string) {
    const extension = path.split(".").pop()?.toLowerCase() ?? "";
    if (!isSupportedInputExtension(extension)) return;
    const stem = basename(path).replace(/\.[^.]+$/, "");
    setInputPath(path);
    setInputExtension(extension);
    setOutputStem(stem);
    const formats = getSupportedOutputFormats(extension);
    if (formats.length > 0 && !formats.includes(toFormat)) {
      setToFormat(formats[0]);
    }
  }

  function validate(paths: string[]) {
    const path = paths[0];
    const extension = path.split(".").pop()?.toLowerCase() ?? "";
    if (!isSupportedInputExtension(extension)) {
      return {
        accepted: [],
        reject: {
          message: `Not a supported document file: ${basename(path)}`,
          description: `Expected one of: ${Object.keys(INPUT_EXT_TO_FORMAT)
            .map((e) => `.${e}`)
            .join(", ")}`,
        },
      };
    }
    return { accepted: [path] };
  }

  return {
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
  };
}
