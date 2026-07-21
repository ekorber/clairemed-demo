import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePageTitle } from "./usePageTitle";

function Page({ title }: { title: string }) {
  usePageTitle(title);
  return null;
}

describe("usePageTitle", () => {
  it("sets a brand-first, middot-joined tab title", () => {
    render(<Page title="Intake chat" />);
    expect(document.title).toBe("Alice · Intake chat");
  });

  it("updates when the page changes", () => {
    const { rerender } = render(<Page title="Home" />);
    expect(document.title).toBe("Alice · Home");
    rerender(<Page title="Notes" />);
    expect(document.title).toBe("Alice · Notes");
  });

  it("uses no em dash in the separator", () => {
    render(<Page title="Home" />);
    expect(document.title).not.toMatch(/[—–]/);
  });
});
