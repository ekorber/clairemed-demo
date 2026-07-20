import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FAKE_DETAIL } from "./fixtures";
import Transcript from "./Transcript";

const MESSAGES = FAKE_DETAIL.messages;

describe("Transcript", () => {
  it("renders each message with its speaker label", () => {
    render(<Transcript messages={MESSAGES} patientName="Ana" />);
    expect(screen.getByText("What brings you in today?")).toBeInTheDocument();
    expect(screen.getByText("Chest tightness when I climb stairs.")).toBeInTheDocument();
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
    expect(screen.getByText(/Ana/)).toBeInTheDocument();
  });

  it("reports the message count in the summary", () => {
    render(<Transcript messages={MESSAGES} patientName="Ana" />);
    expect(screen.getByText(/Full conversation \(2 messages\)/)).toBeInTheDocument();
  });

  it("uses singular wording for a single message", () => {
    render(<Transcript messages={[MESSAGES[0]]} patientName="Ana" />);
    expect(screen.getByText(/Full conversation \(1 message\)/)).toBeInTheDocument();
  });

  it("renders nothing when there are no messages", () => {
    const { container } = render(<Transcript messages={[]} patientName="Ana" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("starts collapsed and expands when the summary is clicked", () => {
    render(<Transcript messages={MESSAGES} patientName="Ana" />);
    const summary = screen.getByText(/Full conversation/);
    const details = summary.closest("details")!;
    expect(details.open).toBe(false);
    fireEvent.click(summary);
    expect(details.open).toBe(true);
  });
});
