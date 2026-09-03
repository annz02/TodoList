export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

const decoder = new TextDecoder();

/**
 * Reads an OpenAI/DeepSeek-compatible `stream:true` chat response body and
 * yields the incremental `delta.content` chunks as they arrive.
 */
async function* streamSSE(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<string, void, unknown> {
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      const line = raw.replace(/\r$/, '');
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        const delta: string | undefined = json?.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        /* skip malformed keep-alive frame */
      }
    }
  }
}

export function useChatStream() {
  /**
   * Send a chat completion request.
   *
   * @returns an async function that streams content deltas through
   *          `onChunk` and resolves with the full message. Provide `signal`
   *          (an AbortSignal from an AbortController) to stop generation.
   */
  async function sendChat(
    opts: {
      endpoint: string;
      apiKey: string;
      model: string;
      messages: ChatMessage[];
      stream?: boolean;
      signal?: AbortSignal;
      onChunk: (chunk: string) => void;
    },
  ): Promise<string> {
    const { endpoint, apiKey, model, messages, stream = true, signal, onChunk } = opts;
    // Messages sent to the API should never carry empty output artifacts.
    const payloadMessages = messages.filter((m) => m.role !== 'system' || m.content.trim() !== '');
    const base = trimEndpoint(endpoint);

    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: payloadMessages,
        stream,
        temperature: 0.7,
      }),
      signal,
    });

    if (!response.ok) {
      let msg = `HTTP ${response.status}`;
      try {
        const err = await response.json();
        msg = err?.error?.message || msg;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }

    if (!stream) {
      const data = await response.json();
      return data?.choices?.[0]?.message?.content || '';
    }

    if (!response.body) return '';
    const reader = response.body.getReader();
    let full = '';
    try {
      for await (const chunk of streamSSE(reader)) {
        full += chunk;
        onChunk(chunk);
      }
    } finally {
      reader.releaseLock();
    }
    return full;
  }

  return { sendChat };
}

/** Helper so callers don't import trimEndpoint from the other composable. */
function trimEndpoint(v: string): string {
  return v.trim().replace(/\/+$/, '');
}
