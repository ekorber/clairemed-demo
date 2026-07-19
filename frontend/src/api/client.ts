import type { ConversationDetail, ConversationSummary, NoteResult } from "./types";

const JSON_HEADERS = { "Content-Type": "application/json" };

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`request failed (${res.status})`);
  return res.json() as Promise<T>;
}

export const api = {
  startConversation(p: { firstName: string; age: number; sex: string }): Promise<Response> {
    return fetch("/api/conversations/start/", {
      method: "POST", headers: JSON_HEADERS,
      body: JSON.stringify({ first_name: p.firstName, age: p.age, sex: p.sex }),
    });
  },
  sendMessage(id: string, content: string): Promise<Response> {
    return fetch(`/api/conversations/${id}/messages/`, {
      method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ content }),
    });
  },
  async generateNote(id: string): Promise<NoteResult> {
    return asJson(await fetch(`/api/conversations/${id}/generate-note/`, { method: "POST" }));
  },
  async fetchConversations(): Promise<ConversationSummary[]> {
    return asJson(await fetch("/api/conversations/"));
  },
  async fetchConversation(id: string): Promise<ConversationDetail> {
    return asJson(await fetch(`/api/conversations/${id}/`));
  },
  async transcribe(blob: Blob): Promise<string> {
    const form = new FormData();
    form.append("audio", blob, "clip.webm");
    const { text } = await asJson<{ text: string }>(await fetch("/api/transcribe/", { method: "POST", body: form }));
    return text;
  },
};
