import { invoke } from '@tauri-apps/api/core';

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
 * Normalizes user-configured LLM endpoint into a canonical base URL.
 * Automatically adds https:// (or http:// for localhost/IPs), strips trailing slashes,
 * and strips redundant trailing `/chat/completions`.
 */
export function normalizeEndpoint(raw: string): string {
  let s = (raw || '').trim();
  if (!s) return 'https://api.deepseek.com/v1';

  // If protocol missing, auto-prepend https:// (or http:// for localhost/ip)
  if (!/^https?:\/\//i.test(s)) {
    if (/^(localhost|127\.0\.0\.1)(:\d+)?/i.test(s)) {
      s = `http://${s}`;
    } else {
      s = `https://${s}`;
    }
  }

  // Strip trailing slashes
  s = s.replace(/\/+$/, '');

  // If user pasted full completions URL e.g. https://api.xxx.com/v1/chat/completions
  s = s.replace(/\/chat\/completions\/?$/i, '');

  return s;
}

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
   * Send a chat completion request with dual-channel support:
   * First tries standard Webview fetch; if blocked by CORS, CSP, or WebView proxy isolation,
   * automatically falls back to native Tauri Rust HTTP client (bypasses all browser restrictions).
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
    const base = normalizeEndpoint(endpoint);
    const targetUrl = `${base}/chat/completions`;

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

    let response: Response | null = null;
    let browserFetchFailed = false;

    try {
      response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(bodyPayload),
        signal,
      });
    } catch (fetchErr: any) {
      // If user manually stopped/aborted generation, do not retry
      if (signal?.aborted) {
        throw fetchErr;
      }
      // Common browser WebView failures: Failed to fetch (CORS / CSP / WebView2 proxy loopback)
      console.warn('Browser fetch failed, attempting Tauri Rust proxy fallback:', fetchErr);
      browserFetchFailed = true;
    }

    // 1. Fallback channel: Tauri Rust backend native request (No CORS, No CSP, system proxy aware)
    if (browserFetchFailed || !response) {
      const proxyResult = await invoke<string>('ai_chat_proxy', {
        url: targetUrl,
        apiKey,
        body: JSON.stringify(bodyPayload),
      }).catch((proxyErr: any) => {
        const errStr = String(proxyErr?.message || proxyErr || '');
        throw new Error(`连接模型服务失败（浏览器与后端双通道均无法连通）：${errStr}`);
      });

      // Parse Rust proxy response
      if (proxyResult.includes('data:')) {
        let full = '';
        const toolMap: Record<number, { id: string; name: string; args: string }> = {};
        const lines = proxyResult.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const json = JSON.parse(data);
            const choice = json?.choices?.[0];
            const delta = choice?.delta;
            if (delta?.content) {
              full += delta.content;
              onChunk(delta.content);
            }
            if (delta?.tool_calls && Array.isArray(delta.tool_calls)) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (!toolMap[idx]) toolMap[idx] = { id: '', name: '', args: '' };
                if (tc.id) toolMap[idx].id = tc.id;
                if (tc.function?.name) toolMap[idx].name += tc.function.name;
                if (tc.function?.arguments) toolMap[idx].args += tc.function.arguments;
              }
            }
          } catch {}
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
      } else {
        // Plain JSON response
        try {
          const json = JSON.parse(proxyResult);
          const choice = json?.choices?.[0];
          const content = choice?.message?.content || '';
          const toolCalls = choice?.message?.tool_calls;
          if (content) onChunk(content);
          return { content, toolCalls };
        } catch {
          if (proxyResult) onChunk(proxyResult);
          return { content: proxyResult };
        }
      }
    }

    // 2. Primary channel: Standard browser streaming
    if (!response.ok) {
      let msg = '';
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
