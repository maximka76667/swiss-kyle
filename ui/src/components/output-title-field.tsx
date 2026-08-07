import { Input } from "@shadcn/components/ui/input";
import { Label } from "@shadcn/components/ui/label";

interface Props {
  id: string;
  value: string;
  onChange: (value: string) => void;
}

export function OutputTitleField({ id, value, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Output title</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
