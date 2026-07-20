import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import NotesPage from "./NotesPage";
import { FAKE_DETAIL } from "./fixtures";

vi.mock("../api/client", () => ({
  api: { fetchConversations: vi.fn(), fetchConversation: vi.fn() },
}));

import { api } from "../api/client";

describe("NotesPage", () => {
  it("keeps the sidebar when only the detail fetch fails", async () => {
    vi.mocked(api.fetchConversations).mockResolvedValue([
      { id: "abc", patient_first_name: "Ana", patient_age: 34, patient_sex: "female",
        status: "complete", chief_complaint_summary: "Chest tightness", has_red_flags: true,
        created_at: "2026-07-18T12:00:00Z" },
    ]);
    vi.mocked(api.fetchConversation).mockRejectedValue(new Error("404"));
    render(
      <MemoryRouter initialEntries={["/notes/abc"]}>
        <Routes>
          <Route path="/notes" element={<NotesPage />} />
          <Route path="/notes/:id" element={<NotesPage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText("Ana")).toBeInTheDocument();
    expect(await screen.findByText(/couldn't load this note/i)).toBeInTheDocument();
  });

  it("shows the transcript even when the note isn't ready", async () => {
    vi.mocked(api.fetchConversations).mockResolvedValue([
      { id: "abc", patient_first_name: "Ana", patient_age: 34, patient_sex: "female",
        status: "active", chief_complaint_summary: "", has_red_flags: false,
        created_at: "2026-07-18T12:00:00Z" },
    ]);
    vi.mocked(api.fetchConversation).mockResolvedValue({
      ...FAKE_DETAIL, note: null, status: "active",
    });
    render(
      <MemoryRouter initialEntries={["/notes/abc"]}>
        <Routes>
          <Route path="/notes" element={<NotesPage />} />
          <Route path="/notes/:id" element={<NotesPage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText(/isn't ready yet/)).toBeInTheDocument();
    expect(await screen.findByText(/Full conversation \(2 messages\)/)).toBeInTheDocument();
  });

  it("renders the transcript below the note when a note is present", async () => {
    vi.mocked(api.fetchConversations).mockResolvedValue([
      { id: "abc", patient_first_name: "Ana", patient_age: 34, patient_sex: "female",
        status: "complete", chief_complaint_summary: "Chest tightness", has_red_flags: true,
        created_at: "2026-07-18T12:00:00Z" },
    ]);
    vi.mocked(api.fetchConversation).mockResolvedValue(FAKE_DETAIL);
    render(
      <MemoryRouter initialEntries={["/notes/abc"]}>
        <Routes>
          <Route path="/notes" element={<NotesPage />} />
          <Route path="/notes/:id" element={<NotesPage />} />
        </Routes>
      </MemoryRouter>
    );
    const note = await screen.findByText(/Draft SOAP note/);
    const transcript = screen.getByText(/Full conversation/);
    expect(note.compareDocumentPosition(transcript)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
