import type { ComponentType } from "react";
import { Scissors, ArrowLeftRight, Combine } from "lucide-react";
import { EditVideo } from "@/features/edit-video/components/edit-video";
import { DocConverter } from "@/features/doc-converter/components/doc-converter";
import { MergePdfs } from "@/features/merge-pdfs/components/merge-pdfs";
import type { Tool } from "@/types/jobs";

export interface ToolComponentProps {
  onJobSubmitted: (
    id: string,
    tool: Tool,
    input: string,
    output: string,
  ) => void;
}

export interface ToolDef {
  id: Tool;
  path: string;
  label: string;
  icon: React.ElementType;
  component: ComponentType<ToolComponentProps>;
}

// Single source of truth for the tools that appear in the sidebar, their
// routes, and their job-history icon.
export const TOOLS: ToolDef[] = [
  {
    id: "edit-video",
    path: "/edit-video",
    label: "Edit Video",
    icon: Scissors,
    component: EditVideo,
  },
  {
    id: "doc-converter",
    path: "/doc-converter",
    label: "Doc Converter",
    icon: ArrowLeftRight,
    component: DocConverter,
  },
  {
    id: "merge-pdfs",
    path: "/merge-pdfs",
    label: "Merge PDFs",
    icon: Combine,
    component: MergePdfs,
  },
];
