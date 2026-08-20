import { describe, expect, it } from "bun:test";
import { getSupportedOutputFormats, isSupportedInputExtension } from "./utils";

describe("getSupportedOutputFormats", () => {
  it("excludes the input's own format from the results", () => {
    expect(getSupportedOutputFormats("md")).toEqual(["docx", "html", "pdf"]);
  });

  it("maps aliased extensions to their canonical format before excluding it", () => {
    expect(getSupportedOutputFormats("markdown")).toEqual([
      "docx",
      "html",
      "pdf",
    ]);
    expect(getSupportedOutputFormats("htm")).toEqual(["md", "docx", "pdf"]);
  });
});

describe("isSupportedInputExtension", () => {
  it("accepts recognized input extensions", () => {
    expect(isSupportedInputExtension("md")).toBe(true);
    expect(isSupportedInputExtension("docx")).toBe(true);
  });

  it("rejects unrecognized extensions", () => {
    expect(isSupportedInputExtension("xyz")).toBe(false);
  });
});
