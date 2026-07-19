import type { ChatEvent } from "./types";

export async function* readSse(res: Response): AsyncGenerator<ChatEvent> {
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(detail || `stream failed (${res.status})`);
  }
  if (!res.body) throw new Error("stream failed (no body)");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const line = raw.split("\n").find((l) => l.startsWith("data: "));
      if (line) yield JSON.parse(line.slice(6)) as ChatEvent;
    }
  }
  const line = buffer.split("\n").find((l) => l.startsWith("data: "));
  if (line) {
    yield JSON.parse(line.slice(6)) as ChatEvent;
  } else if (buffer.trim()) {
    throw new Error("stream ended mid-event");
  }
}
