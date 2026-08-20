import type { DocFormat } from "@/features/doc-converter/lib/types";

export const FORMAT_LABEL: Record<DocFormat, string> = {
  md: "Markdown (.md)",
  docx: "Word Document (.docx)",
  html: "HTML (.html)",
  pdf: "PDF (.pdf)",
};

export const INPUT_EXT_TO_FORMAT: Record<string, DocFormat> = {
  md: "md",
  markdown: "md",
  docx: "docx",
  doc: "docx",
  odt: "docx",
  rtf: "docx",
  html: "html",
  htm: "html",
};

export const OFFICE_EXTS = new Set(["doc", "docx", "odt", "rtf"]);
