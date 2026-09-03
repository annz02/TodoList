export type ChatToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ChatToolCall[];
};

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export interface ChatCompletionResult {
  content: string;
  toolCalls?: ChatToolCall[];
}

type SSEDelta =
  | { type: 'content'; text: string }
  | { type: 'tool_call'; delta: any };

const decoder = new TextDecoder();

/**
 * Reads an OpenAI/DeepSeek-compatible `stream:true` chat response body and
 * yields incremental text content or tool_calls deltas.
 */
async function* streamSSE(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<SSEDelta, void, unknown> {
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
        const choice = json?.choices?.[0];
        const delta = choice?.delta;
        if (delta?.content) {
          yield { type: 'content', text: delta.content };
        }
        if (delta?.tool_calls && Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            yield { type: 'tool_call', delta: tc };
          }
        }
      } catch {
        /* skip malformed keep-alive frame */
      }
    }
  }
}

export function useChatStream() {
  /**
   * Send a chat completion request with optional tool calling support.
   */
  async function sendChat(
    opts: {
      endpoint: string;
      apiKey: string;
      model: string;
      messages: ChatMessage[];
      tools?: ToolDefinition[];
      stream?: boolean;
      signal?: AbortSignal;
      onChunk: (chunk: string) => void;
    },
  ): Promise<ChatCompletionResult> {
    const { endpoint, apiKey, model, messages, tools, stream = true, signal, onChunk } = opts;
    const payloadMessages = messages.filter((m) => m.role !== 'system' || m.content.trim() !== '');
    const base = trimEndpoint(endpoint);

    const bodyPayload: Record<string, any> = {
      model,
      messages: payloadMessages,
      stream,
      temperature: 0.6,
    };

    if (tools && tools.length > 0) {
      bodyPayload.tools = tools;
      bodyPayload.tool_choice = 'auto';
    }

    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(bodyPayload),
      signal,
    });

    if (!response.ok) {
      let msg = '';
      // Model providers may return JSON errors, but some gateways reply with
      // plain text (or a body stating HTTP parse) for e.g. a 400. Read both.
      const bodyText = await response.text().catch(() => '');
      if (bodyText) {
        const trimmed = bodyText.replace(/^\s+/, '');
        if (trimmed.startsWith('{')) {
          try {
            const err = JSON.parse(trimmed);
            msg = err?.error?.message || err?.message || '';
          } catch {
            msg = '';
          }
        }
        if (!msg) msg = trimmed.length > 300 ? `${trimmed.slice(0, 300)}…` : trimmed;
      }
      if (!msg) msg = `HTTP ${response.status}`;

      const statusHint =
        response.status === 400
          ? '（HTTP 400：多为请求地址/模型名格式问题，请检查“模型配置”中的请求地址与模型名，或换用服务商支持的模型标识）'
          : response.status === 401 || response.status === 403
            ? '（鉴权失败：请检查 API Key 是否正确、是否过期或缺少该模型权限）'
            : response.status === 429
              ? '（请求过于频繁或额度不足：HTTP 429，请稍候重试）'
              : '';

      throw new Error(`${msg}${statusHint}`);
    }

    if (!stream) {
      const data = await response.json();
      const choice = data?.choices?.[0];
      const content = choice?.message?.content || '';
      const toolCalls = choice?.message?.tool_calls;
      return { content, toolCalls };
    }

    if (!response.body) return { content: '' };
    const reader = response.body.getReader();
    let full = '';
    const toolMap: Record<number, { id: string; name: string; args: string }> = {};

    try {
      for await (const chunk of streamSSE(reader)) {
        if (chunk.type === 'content') {
          full += chunk.text;
          onChunk(chunk.text);
        } else if (chunk.type === 'tool_call') {
          const tc = chunk.delta;
          const idx = tc.index ?? 0;
          if (!toolMap[idx]) {
            toolMap[idx] = { id: '', name: '', args: '' };
          }
          if (tc.id) toolMap[idx].id = tc.id;
          if (tc.function?.name) toolMap[idx].name += tc.function.name;
          if (tc.function?.arguments) toolMap[idx].args += tc.function.arguments;
        }
      }
    } finally {
      reader.releaseLock();
    }

    const toolIndices = Object.keys(toolMap).map(Number);
    let toolCalls: ChatToolCall[] | undefined;
    if (toolIndices.length > 0) {
      toolCalls = toolIndices.map((i) => ({
        id: toolMap[i].id || `call_${Date.now()}_${i}`,
        type: 'function' as const,
        function: {
          name: toolMap[i].name,
          arguments: toolMap[i].args,
        },
      }));
    }

    return { content: full, toolCalls };
  }

  return { sendChat };
}

/** Helper so callers don't import trimEndpoint from the other composable. */
function trimEndpoint(v: string): string {
  return v.trim().replace(/\/+$/, '');
}
