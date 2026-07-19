import { describe, expect, it } from "vitest";
import { chatReducer, initialChatState, type ChatState } from "./chatReducer";

const reduce = (state: ChatState, ...actions: Parameters<typeof chatReducer>[1][]) =>
  actions.reduce(chatReducer, state);

describe("chatReducer", () => {
  it("full happy path: start → stream greeting → send → complete", () => {
    let s = reduce(initialChatState, { type: "START" });
    expect(s.phase).toBe("starting");
    s = reduce(s, { type: "CONVERSATION_ID", id: "abc" }, { type: "DELTA", text: "Hi Ana!" });
    expect(s.phase).toBe("streaming");
    expect(s.streaming).toBe("Hi Ana!");
    s = reduce(s, { type: "STREAM_DONE", stage: "complaint", interviewComplete: false });
    expect(s.phase).toBe("idle");
    expect(s.messages).toEqual([{ role: "assistant", content: "Hi Ana!" }]);
    expect(s.streaming).toBe("");
    s = reduce(s, { type: "PATIENT_MESSAGE", content: "Headache" },
      { type: "DELTA", text: "Bye!" },
      { type: "STREAM_DONE", stage: "wrap_up", interviewComplete: true });
    expect(s.messages.map((m) => m.role)).toEqual(["assistant", "patient", "assistant"]);
    expect(s.interviewComplete).toBe(true);
  });

  it("error during chat keeps history and drops partial stream", () => {
    let s = reduce(initialChatState, { type: "START" }, { type: "CONVERSATION_ID", id: "abc" },
      { type: "STREAM_DONE", stage: "complaint", interviewComplete: false },
      { type: "PATIENT_MESSAGE", content: "Hi" }, { type: "DELTA", text: "par" },
      { type: "ERROR", kind: "chat", message: "oops" });
    expect(s.phase).toBe("error");
    expect(s.errorKind).toBe("chat");
    expect(s.streaming).toBe("");
    expect(s.messages.at(-1)).toEqual({ role: "patient", content: "Hi" });
    s = reduce(s, { type: "RETRY" });
    expect(s.phase).toBe("idle");
  });

  it("note generation transitions", () => {
    let s = reduce(initialChatState, { type: "GENERATING" });
    expect(s.phase).toBe("generating");
    s = reduce(s, { type: "NOTE_READY" });
    expect(s.phase).toBe("done");
  });

  it("GENERATING clears stale error state", () => {
    let s = reduce(initialChatState, { type: "ERROR", kind: "note", message: "boom" });
    s = reduce(s, { type: "GENERATING" });
    expect(s.phase).toBe("generating");
    expect(s.errorKind).toBeNull();
    expect(s.error).toBeNull();
  });
});
