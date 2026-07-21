// Shared sizing for the chat composer, so the Speak button, text input, and Send button
// stay exactly the same height. The two buttons take INPUT_MIN_H as a fixed height; the
// textarea takes it as a min-height and grows to INPUT_MAX_H before scrolling.
export const INPUT_MIN_H = 64; // px, ~2 lines at rest (just above the natural 2-line box so
                               // this value, not the browser default, controls the floor)
export const INPUT_MAX_H = 156; // px, ~6 lines before the textarea starts to scroll

/** Height a textarea should adopt to fit its content, clamped to the composer's range.
 *  The caller resets the element to height:auto first so scrollHeight reflects the content
 *  rather than the current box. */
export function clampInputHeight(scrollHeight: number): number {
  return Math.min(Math.max(scrollHeight, INPUT_MIN_H), INPUT_MAX_H);
}
