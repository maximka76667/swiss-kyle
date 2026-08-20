import { FileDropZone } from "@/components/file-drop-zone";
import { basename } from "@/lib/utils";
import { EXTENSION_TO_FORMAT } from "@/features/doc-converter/constants/file-formats";
import { validateInputFile } from "@/features/doc-converter/lib/utils";
import { useConverterStore } from "@/features/doc-converter/store/use-converter-store";

export function DocConverterDropZone() {
  const inputFile = useConverterStore((s) => s.inputFile);
  const selectFile = useConverterStore((s) => s.selectFile);

  return (
    <FileDropZone
      multiple={false}
      dialogFilter={{
        name: "Documents",
        extensions: Object.keys(EXTENSION_TO_FORMAT),
      }}
      validate={validateInputFile}
      onFiles={([path]) => selectFile(path)}
      prompt="Drag & drop a document here"
      hint="or click to browse"
      selectedLabel={inputFile ? basename(inputFile.filePath) : null}
    />
  );
}
