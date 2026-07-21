import { describe, expect, it } from "vitest";
import { clampInputHeight, INPUT_MAX_H, INPUT_MIN_H } from "./inputSizing";

describe("clampInputHeight", () => {
  it("holds at the resting minimum for a single short line", () => {
    expect(clampInputHeight(24)).toBe(INPUT_MIN_H);
  });

  it("follows the content height between the min and the max", () => {
    const mid = (INPUT_MIN_H + INPUT_MAX_H) / 2;
    expect(clampInputHeight(mid)).toBe(mid);
  });

  it("caps at the maximum so a long answer scrolls instead of growing forever", () => {
    expect(clampInputHeight(INPUT_MAX_H + 500)).toBe(INPUT_MAX_H);
  });

  it("returns the exact bounds at the edges", () => {
    expect(clampInputHeight(INPUT_MIN_H)).toBe(INPUT_MIN_H);
    expect(clampInputHeight(INPUT_MAX_H)).toBe(INPUT_MAX_H);
  });
});
