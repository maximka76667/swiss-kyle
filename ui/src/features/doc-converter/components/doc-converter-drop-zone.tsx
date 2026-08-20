import { FileDropZone } from "@/components/file-drop-zone";
import { basename } from "@/lib/utils";
import { EXTENSION_TO_FORMAT } from "@/features/doc-converter/constants/file-formats";

interface DocConverterDropZoneProps {
  inputPath: string | null;
  validate: (paths: string[]) => {
    accepted: string[];
    reject?: { message: string; description?: string };
  };
  onFile: (path: string) => void;
}

export function DocConverterDropZone({
  inputPath,
  validate,
  onFile,
}: DocConverterDropZoneProps) {
  return (
    <FileDropZone
      multiple={false}
      dialogFilter={{
        name: "Documents",
        extensions: Object.keys(EXTENSION_TO_FORMAT),
      }}
      validate={validate}
      onFiles={([path]) => onFile(path)}
      prompt="Drag & drop a document here"
      hint="or click to browse"
      selectedLabel={inputPath ? basename(inputPath) : null}
    />
  );
}
