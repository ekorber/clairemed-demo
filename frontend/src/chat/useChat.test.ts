import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../api/client", () => ({
  api: { startConversation: vi.fn(), sendMessage: vi.fn(), generateNote: vi.fn() },
}));

import { api } from "../api/client";
import { useChat } from "./useChat";

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(encoder.encode(c)));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

describe("useChat", () => {
  it("retries a failed greeting by starting over, not sending an empty message", async () => {
    vi.mocked(api.startConversation).mockResolvedValueOnce(sseResponse([
      'data: {"conversation_id": "abc"}\n\ndata: {"error": "Alice had trouble replying."}\n\n',
    ]));
    const { result } = renderHook(() => useChat());
    await act(async () => { await result.current.start({ firstName: "Ana", age: 34, sex: "female" }); });
    expect(result.current.state.phase).toBe("error");

    vi.mocked(api.startConversation).mockResolvedValueOnce(sseResponse([
      'data: {"conversation_id": "abc2"}\n\ndata: {"delta": "Hi Ana!"}\n\ndata: {"done": true, "stage": "complaint", "interview_complete": false}\n\n',
    ]));
    await act(async () => { result.current.retryLastSend(); });
    await waitFor(() => expect(result.current.state.phase).toBe("idle"));
    expect(api.startConversation).toHaveBeenCalledTimes(2);
    expect(api.sendMessage).not.toHaveBeenCalled();
  });
});
