import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FAKE_DETAIL } from "./fixtures";
import NoteView from "./NoteView";

describe("NoteView", () => {
  it("shows red flag banner, cards, and SOAP sections", () => {
    render(<NoteView detail={FAKE_DETAIL} />);
    expect(screen.getByText(/red flags/i)).toBeInTheDocument();
    expect(screen.getByText(/Chest pain with exertion/)).toBeInTheDocument();
    expect(screen.getByText(/Penicillin — rash \(mild\)/)).toBeInTheDocument();
    expect(screen.getByText(/Lisinopril 10 mg, daily/)).toBeInTheDocument();
    expect(screen.getByText(/like a band around my chest/)).toBeInTheDocument();
    expect(screen.getByText(/To be completed at visit/)).toBeInTheDocument();
  });

  it("shows pending state when note is missing", () => {
    render(<NoteView detail={{ ...FAKE_DETAIL, note: null, status: "active" }} />);
    expect(screen.getByText(/isn't ready yet/)).toBeInTheDocument();
  });
});
