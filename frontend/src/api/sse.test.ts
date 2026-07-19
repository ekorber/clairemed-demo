import { describe, expect, it } from "vitest";
import { readSse } from "./sse";

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(encoder.encode(c)));
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
}

describe("readSse", () => {
  it("yields parsed events, tolerating chunk boundaries mid-event", async () => {
    const res = sseResponse([
      'data: {"conversation_id": "abc"}\n\ndata: {"del',
      'ta": "Hi"}\n\ndata: {"done": true, "stage": "complaint", "interview_complete": false}\n\n',
    ]);
    const events = [];
    for await (const e of readSse(res)) events.push(e);
    expect(events).toEqual([
      { conversation_id: "abc" },
      { delta: "Hi" },
      { done: true, stage: "complaint", interview_complete: false },
    ]);
  });

  it("parses a final event that lacks the trailing terminator", async () => {
    const res = sseResponse(['data: {"delta": "Hi"}\n\ndata: {"done": true, "stage": null, "interview_complete": true}']);
    const events = [];
    for await (const e of readSse(res)) events.push(e);
    expect(events).toEqual([{ delta: "Hi" }, { done: true, stage: null, interview_complete: true }]);
  });

  it("throws when the stream ends mid-event", async () => {
    const res = sseResponse(['data: {"delta": "tru']);
    await expect(async () => {
      for await (const _ of readSse(res)) void _;
    }).rejects.toThrow();
  });

  it("surfaces the error body on non-ok responses", async () => {
    const res = new Response("content must be 1-2000 characters", { status: 400 });
    await expect(async () => {
      for await (const _ of readSse(res)) void _;
    }).rejects.toThrow(/content must be 1-2000 characters/);
  });
});
