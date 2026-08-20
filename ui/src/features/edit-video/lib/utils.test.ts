import { describe, expect, it } from "bun:test";
import { clamp, letterbox } from "./utils";

describe("clamp", () => {
  it("passes values already inside the range through unchanged", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("clamps to the minimum", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it("clamps to the maximum", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("is inclusive of both bounds", () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });
});

describe("letterbox", () => {
  it("returns a scale of 1 with no offset when the box exactly fits the content", () => {
    const result = letterbox({ width: 200, height: 100 }, 200, 100);
    expect(result).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });

  it("pillarboxes (horizontal bars) when the box is wider than the content's aspect ratio", () => {
    // 100x100 content in a 200x100 box: scale is limited by height, leaving
    // horizontal space split evenly on both sides.
    const result = letterbox({ width: 200, height: 100 }, 100, 100);
    expect(result.scale).toBe(1);
    expect(result.offsetX).toBe(50);
    expect(result.offsetY).toBe(0);
  });

  it("letterboxes (vertical bars) when the box is taller than the content's aspect ratio", () => {
    // 100x100 content in a 100x200 box: scale is limited by width, leaving
    // vertical space split evenly top and bottom.
    const result = letterbox({ width: 100, height: 200 }, 100, 100);
    expect(result.scale).toBe(1);
    expect(result.offsetX).toBe(0);
    expect(result.offsetY).toBe(50);
  });

  it("scales down proportionally when the content is larger than the box", () => {
    // 1000x500 content (2:1) in a 100x100 box: width is the limiting
    // dimension (scale 0.1), so the scaled content is 100x50, centered
    // vertically.
    const result = letterbox({ width: 100, height: 100 }, 1000, 500);
    expect(result.scale).toBeCloseTo(0.1);
    expect(result.offsetX).toBeCloseTo(0);
    expect(result.offsetY).toBeCloseTo(25);
  });
});
