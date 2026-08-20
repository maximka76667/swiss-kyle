import type {
  DocFormat,
  InputExtension,
} from "@/features/doc-converter/lib/types";

export const FORMAT_LABEL: Record<DocFormat, string> = {
  md: "Markdown (.md)",
  docx: "Word Document (.docx)",
  html: "HTML (.html)",
  pdf: "PDF (.pdf)",
};

export const EXTENSION_TO_FORMAT: Record<string, DocFormat> = {
  md: "md",
  markdown: "md",
  docx: "docx",
  doc: "docx",
  odt: "docx",
  rtf: "docx",
  html: "html",
  htm: "html",
};

// Word-processor formats (not strictly Microsoft — .odt is LibreOffice's own)
// that convert to PDF via an external engine, so the user has to pick which
// one: Word or LibreOffice.
export const OFFICE_EXTENSIONS: Set<InputExtension> = new Set([
  "doc",
  "docx",
  "odt",
  "rtf",
] as const);
