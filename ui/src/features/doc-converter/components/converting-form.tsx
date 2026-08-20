import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@shadcn/components/ui/button";
import { Label } from "@shadcn/components/ui/label";
import { OutputTitleField } from "@/components/output-title-field";
import { FORMAT_LABEL } from "@/features/doc-converter/constants/file-formats";
import type { DocFormat, Converter } from "@/features/doc-converter/lib/types";
import {
  useConverterStore,
  selectAvailableFormats,
  selectShowConverter,
} from "@/features/doc-converter/store/use-converter-store";

interface ConvertingFormProps {
  onSubmit: (converter: Converter) => void;
}

/** Renders nothing until a file is selected in the store — visibility is handled internally, not by the caller. */
export function ConvertingForm({ onSubmit }: ConvertingFormProps) {
  const inputFile = useConverterStore((s) => s.inputFile);
  const outputStem = useConverterStore((s) => s.outputStem);
  const setOutputStem = useConverterStore((s) => s.setOutputStem);
  const toFormat = useConverterStore((s) => s.toFormat);
  const setToFormat = useConverterStore((s) => s.setToFormat);

  // Needs a useShallow to prevent an infinite rerender loop.
  const availableFormats = useConverterStore(useShallow(selectAvailableFormats));
  const showConverter = useConverterStore(selectShowConverter);

  const [converter, setConverter] = useState<Converter>("word");

  if (!inputFile) return null;

  return (
    <>
      <OutputTitleField
        id="doc-output-stem"
        value={outputStem}
        onChange={setOutputStem}
      />

      <div className="flex flex-col gap-2">
        <Label htmlFor="doc-to-format">Convert to</Label>
        <select
          id="doc-to-format"
          title="Select output format"
          value={toFormat}
          onChange={(e) => setToFormat(e.target.value as DocFormat)}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {availableFormats.map((f) => (
            <option key={f} value={f}>
              {FORMAT_LABEL[f]}
            </option>
          ))}
        </select>
      </div>

      {showConverter && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="doc-converter">PDF converter</Label>
          <select
            id="doc-converter"
            title="Select PDF converter"
            value={converter}
            onChange={(e) => setConverter(e.target.value as Converter)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="word">Microsoft Word (Windows only)</option>
            <option value="libreoffice">LibreOffice</option>
          </select>
        </div>
      )}

      <Button type="button" onClick={() => onSubmit(converter)}>
        Convert
      </Button>
    </>
  );
}
