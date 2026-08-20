import type { EXTENSION_TO_FORMAT } from "@/features/doc-converter/constants/file-formats";

export type DocFormat = "md" | "docx" | "html" | "pdf";
export type Converter = "word" | "libreoffice";
export type InputExtension = keyof typeof EXTENSION_TO_FORMAT;
