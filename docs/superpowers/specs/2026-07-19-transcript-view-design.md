# Transcript view on the notes page

**Date:** 2026-07-19
**Status:** Approved, ready for planning

## Problem

The notes page shows the structured note generated from an intake conversation, but there is no
way to read the conversation itself. A physician who doubts a line in the note, or who wants to
see how a question was phrased before an answer was given, has no recourse. Conversations that
never produced a note (abandoned or still in progress) are completely opaque in the UI.

## Scope

Frontend only. No backend, API, model, or shared-type changes are required:

- `ConversationDetailSerializer` (`backend/intake/serializers.py`) already returns `messages`.
- `ConversationDetail.messages` is already declared in `frontend/src/api/types.ts`.
- `NotesPage` already holds the fetched `detail` object in state.

The transcript renders from data that is already fetched on every note view and currently
discarded.

## Architecture

`Transcript` is a sibling of `NoteView`, not a child. Both are rendered by `NotesPage` inside the
detail pane:

```
NotesPage (owns detail state, fetch unchanged)
  └── detail pane
        ├── NoteView    detail          — behavior unchanged
        └── Transcript  detail.messages — new
```

The sibling relationship is the key decision. `NoteView` early-returns a pending message when
`detail.note` is null. Because `Transcript` sits outside `NoteView`, that early return kills only
`NoteView`'s own subtree and the transcript still renders beneath it. The requirement "show the
transcript even when no note exists" is satisfied structurally, with no added conditional logic
and no restructuring of `NoteView`'s control flow.

## Components

### New: `frontend/src/notes/Transcript.tsx`

Props:

```ts
{ messages: ConversationDetail["messages"]; patientName: string }
```

- Renders a native `<details>` element, collapsed by default, styled to match the existing `Card`
  blocks in `NoteView` (`rounded-xl border border-slate-200 bg-white p-4`). `Card` is currently a
  private helper inside `NoteView.tsx` and is not exported. `Transcript` applies the container
  classes directly rather than importing it: `Card` hard-codes an uppercase `<h3>` title, which is
  the wrong element for an interactive `<summary>`. Extracting `Card` to a shared module is not
  worth it for one reuse with a different heading requirement.
- `<summary>` reads `Full conversation (N messages)`.
- Messages render in array order. The API orders them by `created_at` (see `Message.Meta.ordering`),
  so no client-side sort is needed.
- Bubble styling reuses the visual language already established in `ChatPage`: assistant messages
  left-aligned, white with a slate border; patient messages right-aligned, teal.
- Each message is labeled with its speaker — `Alice` for `role: "assistant"`, `patientName` for
  `role: "patient"`. A physician reading a transcript out of context needs to know who said what;
  colour and alignment alone are not sufficient.
- Per-message timestamp via `toLocaleTimeString()`.
- `whitespace-pre-wrap` on message content, matching `ChatPage`, so multi-line patient answers are
  not collapsed.

Native `<details>` is used rather than `useState` so that keyboard accessibility and
expand/collapse semantics come for free, with no state to manage or test.

### Changed: `NotesPage.tsx`

Lift the `mx-auto max-w-3xl p-4 sm:p-6` wrapper out of `NoteView` into the detail pane so both
children share alignment, then render `<Transcript>` after `<NoteView>`.

### Changed: `NoteView.tsx`

Drop the outer wrapper div (now owned by `NotesPage`), keeping `space-y-4` on its root. The
early-return message also drops its `p-8` class, since `NotesPage` now supplies that padding
for both children.

## Behavior decisions

| Question | Decision |
|---|---|
| Placement | Collapsed section below the note, expands in place |
| Note not yet generated | Transcript still renders, below the existing pending message |
| Existing "Copy note" button | Unchanged. Clipboard payload stays note-only |
| Separate "Copy transcript" | Not included |

The clipboard payload is deliberately left alone. The structured note is what belongs in the EHR;
a raw AI chat log pasted into a chart is bloat. This also avoids regressing the existing
`noteText` tests.

## Edge cases

- **Empty `messages` array** — render nothing at all, not an empty collapsible. A conversation with
  no messages has no transcript worth advertising.
- **Long transcripts** — no truncation or virtualization. Interviews run roughly 12-25 messages and
  the detail pane already scrolls. Windowing here would be speculative.
- **Errors** — no new error states. `Transcript` performs no fetch of its own, so the existing
  `detailError` handling in `NotesPage` already covers the failure path.

## Testing

Follows the repo's existing vitest + Testing Library conventions.

**Fixtures.** `FAKE_DETAIL.messages` in `frontend/src/notes/fixtures.ts` is currently `[]` and needs
representative messages added. It is a shared fixture, so `NoteView.test.tsx` and
`NotesPage.test.tsx` must be re-run to confirm the change does not disturb them.

**`Transcript.test.tsx`:**

- Renders content and speaker labels for both assistant and patient messages.
- Renders nothing when `messages` is empty.
- Expanding works: assert the `open` attribute is set after clicking the `<summary>`.

**`NotesPage.test.tsx`:**

- Add a case asserting the transcript renders when `note` is `null`. This is the requirement most
  likely to regress and the main reason for the sibling architecture.

**Known testing caveat.** With `<details>`, children remain mounted in the DOM while collapsed.
A `getByText` assertion therefore passes whether or not the section is actually expandable, and
does not by itself prove the expand interaction works. The `open`-attribute assertion above exists
specifically to cover what the content assertion cannot.

## Out of scope

- Replacing or removing `patient_quotes` from the note. The transcript complements it: quotes are
  the model's selected evidence, the transcript is the unedited record including how each question
  was phrased.
- Search, filtering, or highlighting within the transcript.
- Exporting or printing the transcript.
