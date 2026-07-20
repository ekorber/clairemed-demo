# Notes Page Transcript View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsed "Full conversation" section below the clinical note so a reviewing physician can read the raw intake conversation.

**Architecture:** A new `Transcript` component renders as a *sibling* of `NoteView`, both owned by `NotesPage`. The sibling relationship is load-bearing: `NoteView` early-returns when no note exists, and because `Transcript` sits outside it, that early return hides only `NoteView` and the transcript still renders. No backend, API, model, or shared-type changes — `ConversationDetailSerializer` already returns `messages` and `ConversationDetail.messages` is already typed.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Vite, Vitest + @testing-library/react (jsdom), oxlint.

**Spec:** `docs/superpowers/specs/2026-07-19-transcript-view-design.md`

## Global Constraints

- All commands run from the `frontend/` directory.
- Test command is `npm test` (`vitest run --passWithNoTests`). Single file: `npx vitest run <path>`.
- **`@testing-library/user-event` is NOT installed.** Use `fireEvent` from `@testing-library/react` for interactions. Do not add the dependency.
- Baseline before this work: **6 test files, 13 tests, all passing.** Every "run the full suite" step must still show all tests passing, with the new counts.
- Use native `<details>`/`<summary>` for collapse. No `useState`. Verified: this jsdom version does toggle `open` on summary click, so the expand test is valid.
- Assistant messages are labeled `Alice`; patient messages are labeled with the patient's first name.
- Styling follows existing components. Card container classes: `rounded-xl border border-slate-200 bg-white p-4`. Bubble classes mirror `ChatPage.tsx`.
- Do not modify `noteText.ts` or the "Copy note" button. The clipboard payload stays note-only by design.
- Branch is `feat/notes-transcript-view`, already created and holding the spec commit.

**Discovered during Task 1 (plan gap, resolved):** `frontend/src/test-setup.ts` had no global
`afterEach(cleanup)`, and `vite.config.ts` does not set `test.globals: true`, so
`@testing-library/react`'s automatic cleanup never self-registered. Rendering the same component
in more than one test therefore leaked DOM between tests. Task 1's suite fails 2 of 5 tests
without the hook (`getByText` finds multiple elements). Task 1 consequently also modifies
`test-setup.ts` to add `afterEach(() => cleanup())`, which is outside its stated file list.
Verified safe: of the 6 pre-existing test files, only `NoteView.test.tsx` and `NotesPage.test.tsx`
call `render()`, and neither relies on residual DOM. Full suite green at 7 files / 18 tests.

---

### Task 1: Transcript component

Builds and tests the component in isolation. Not yet wired into the page — that is Task 2.

**Files:**
- Create: `frontend/src/notes/Transcript.tsx`
- Create: `frontend/src/notes/Transcript.test.tsx`
- Modify: `frontend/src/notes/fixtures.ts:24` (the `messages: []` line in `FAKE_DETAIL`)

**Interfaces:**
- Consumes: `ConversationDetail` from `../api/types` (existing). Message shape is `{ role: "assistant" | "patient"; content: string; created_at: string }`.
- Produces: default export `Transcript`, props `{ messages: ConversationDetail["messages"]; patientName: string }`. Task 2 renders this.

- [ ] **Step 1: Add messages to the shared fixture**

`FAKE_DETAIL.messages` is currently `[]`. In `frontend/src/notes/fixtures.ts`, replace the line:

```ts
  messages: [], note: { data: FAKE_NOTE, red_flags: FAKE_NOTE.red_flags },
```

with:

```ts
  messages: [
    { role: "assistant", content: "What brings you in today?", created_at: "2026-07-18T12:00:00Z" },
    { role: "patient", content: "Chest tightness when I climb stairs.", created_at: "2026-07-18T12:00:30Z" },
  ],
  note: { data: FAKE_NOTE, red_flags: FAKE_NOTE.red_flags },
```

- [ ] **Step 2: Confirm the fixture change didn't disturb existing tests**

`FAKE_DETAIL` is shared with `NoteView.test.tsx` and others, so verify before building on it.

Run: `npm test`
Expected: PASS, 6 files / 13 tests. If anything fails here, the fixture change broke an existing assertion — fix that before continuing.

- [ ] **Step 3: Write the failing tests**

Create `frontend/src/notes/Transcript.test.tsx`:

```tsx
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
```

Note on the last test: `<details>` keeps its children mounted while collapsed, so a `getByText` assertion passes whether or not the section expands. The `open` assertion is what actually covers the interaction — do not replace it with a content check.

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run src/notes/Transcript.test.tsx`
Expected: FAIL — `Failed to resolve import "./Transcript"`, since the component does not exist yet.

- [ ] **Step 5: Write the component**

Create `frontend/src/notes/Transcript.tsx`:

```tsx
import type { ConversationDetail } from "../api/types";

export default function Transcript({
  messages,
  patientName,
}: {
  messages: ConversationDetail["messages"];
  patientName: string;
}) {
  if (messages.length === 0) return null;

  return (
    <details className="rounded-xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-slate-500">
        Full conversation ({messages.length} message{messages.length === 1 ? "" : "s"})
      </summary>
      <div className="mt-3 space-y-3">
        {messages.map((m, i) => {
          const isAssistant = m.role === "assistant";
          return (
            <div key={i} className={isAssistant ? "" : "flex flex-col items-end"}>
              <p className="mb-0.5 text-xs text-slate-400">
                {isAssistant ? "Alice" : patientName} · {new Date(m.created_at).toLocaleTimeString()}
              </p>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] ${
                  isAssistant ? "border border-slate-200 bg-white" : "bg-teal-600 text-white"
                }`}
              >
                {m.content}
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
}
```

Messages render in array order. The API orders by `created_at` (`Message.Meta.ordering` in `backend/intake/models.py`), so no client-side sort is needed.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/notes/Transcript.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 7: Run the full suite and lint**

Run: `npm test && npm run lint`
Expected: PASS, 7 files / 18 tests. Lint clean.

- [ ] **Step 8: Commit**

```bash
git add src/notes/Transcript.tsx src/notes/Transcript.test.tsx src/notes/fixtures.ts
git commit -m "feat: transcript component for intake conversations"
```

---

### Task 2: Wire the transcript into the notes page

**Files:**
- Modify: `frontend/src/notes/NotesPage.tsx:56-71` (detail pane) and its import block
- Modify: `frontend/src/notes/NoteView.tsx:24-25` (early return) and `:34` (root element)
- Modify: `frontend/src/notes/NotesPage.test.tsx`

**Interfaces:**
- Consumes: `Transcript` from Task 1, props `{ messages, patientName }`.
- Produces: no new exports. `NoteView`'s outer layout wrapper moves to `NotesPage`; `NoteView`'s public props are unchanged.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/notes/NotesPage.test.tsx`. First add the fixture import below the existing `import NotesPage from "./NotesPage";` line:

```tsx
import { FAKE_DETAIL } from "./fixtures";
```

Then add this case inside the existing `describe("NotesPage", ...)` block:

```tsx
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
```

This is the requirement most likely to regress and the whole reason `Transcript` is a sibling rather than a child.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/notes/NotesPage.test.tsx`
Expected: FAIL — the `isn't ready yet` assertion passes, then the `Full conversation` assertion fails with "Unable to find an element with the text", because the transcript is not wired in yet.

- [ ] **Step 3: Move the layout wrapper out of NoteView**

In `frontend/src/notes/NoteView.tsx`, change the early return from:

```tsx
  if (!note)
    return <p className="p-8 text-slate-500">This note isn't ready yet. The interview may still be in progress.</p>;
```

to (drop `p-8`; `NotesPage` now supplies padding):

```tsx
  if (!note)
    return <p className="text-slate-500">This note isn't ready yet. The interview may still be in progress.</p>;
```

Then change the root element of the main return from:

```tsx
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
```

to:

```tsx
    <div className="space-y-4">
```

Leave everything else in the file alone. The early return's *logic* is unchanged — only its padding class.

- [ ] **Step 4: Render Transcript alongside NoteView**

In `frontend/src/notes/NotesPage.tsx`, add the import after the `NoteView` import:

```tsx
import Transcript from "./Transcript";
```

Then replace this block:

```tsx
          ) : detail ? (
            <>
              <Link to="/notes" className="m-4 inline-block text-sm text-teal-700 md:hidden">← All conversations</Link>
              <NoteView detail={detail} />
            </>
          ) : (
```

with:

```tsx
          ) : detail ? (
            <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
              <Link to="/notes" className="inline-block text-sm text-teal-700 md:hidden">← All conversations</Link>
              <NoteView detail={detail} />
              <Transcript messages={detail.messages} patientName={detail.patient_first_name} />
            </div>
          ) : (
```

The `Link` loses `m-4` because the wrapper now provides padding.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/notes/NotesPage.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 6: Run the full suite and lint**

Run: `npm test && npm run lint`
Expected: PASS, 7 files / 19 tests. Lint clean.

- [ ] **Step 7: Commit**

```bash
git add src/notes/NotesPage.tsx src/notes/NoteView.tsx src/notes/NotesPage.test.tsx
git commit -m "feat: show intake transcript on the notes page"
```

---

### Task 3: Verify in the running app

Tests pass in jsdom, which says nothing about how this actually looks or whether the layout survived moving the wrapper. This task is browser verification against real data.

**Files:** None modified unless a defect is found.

**Interfaces:** None.

- [ ] **Step 1: Confirm dev servers are running**

Run: `curl -s http://127.0.0.1:8000/api/health/`
Expected: `{"status": "ok"}`

If not running, see `README.md` "Run locally (dev)". The Vite dev server should be on `http://localhost:5173`.

- [ ] **Step 2: Open a completed conversation**

Navigate to `http://localhost:5173/notes` and select a conversation that has a generated note.

Verify:
- The "Full conversation (N messages)" section appears **below** the Draft SOAP note card.
- It is **collapsed** on load.
- Clicking it expands in place; clicking again collapses it.
- Expanded, messages alternate: `Alice` labels on left-aligned bordered bubbles, patient-name labels on right-aligned teal bubbles.
- Note content and card widths are unchanged from before — confirms moving the `max-w-3xl` wrapper did not shift the layout.

- [ ] **Step 3: Check the no-note case**

This is the case the architecture exists for, and it needs a conversation whose interview never completed. If none exists, start one at `/chat`, answer one question, then navigate away without finishing.

Open that conversation from `/notes` and verify both the "isn't ready yet" message **and** the transcript section render.

- [ ] **Step 4: Check mobile width**

Resize the viewport to 375px wide. Verify the transcript bubbles wrap rather than overflowing horizontally, and the "← All conversations" back link still sits correctly now that it lost `m-4`.

- [ ] **Step 5: Confirm the note copy path is untouched**

Click "Copy note" and paste into a scratch buffer. Verify the payload contains the structured note and **no** transcript text. The spec deliberately keeps the raw chat log out of the EHR paste.

- [ ] **Step 6: Commit any fixes**

Only if Steps 2-5 surfaced defects. Otherwise nothing to commit.

```bash
git add -A
git commit -m "fix: <specific defect found during verification>"
```

---

## Definition of Done

- `npm test` passes: 7 files / 19 tests.
- `npm run lint` clean.
- Transcript renders below the note, collapsed by default, on both the note-present and note-absent paths.
- "Copy note" output unchanged.
- No backend, API, model, or type-definition files modified.
