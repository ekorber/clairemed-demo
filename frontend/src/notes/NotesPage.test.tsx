import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import NotesPage from "./NotesPage";

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
});
