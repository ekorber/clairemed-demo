import { describe, expect, it } from "vitest";
import { noteToText } from "./noteText";
import { FAKE_NOTE } from "./fixtures";

describe("noteToText", () => {
  it("renders all major sections as labeled plain text", () => {
    const text = noteToText(FAKE_NOTE, "Ana, 34, female");
    for (const heading of ["PRE-VISIT NOTE", "RED FLAGS", "ALLERGIES", "MEDICATIONS",
      "MEDICAL HISTORY", "FAMILY HISTORY", "SOCIAL HISTORY", "REVIEW OF SYSTEMS",
      "SUBJECTIVE", "OBJECTIVE", "ASSESSMENT", "PLAN"]) {
      expect(text).toContain(heading);
    }
    expect(text).toContain("Penicillin");
    expect(text).toContain("Ana, 34, female");
  });
});
