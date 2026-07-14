/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Real copilot SSE streaming (docs/02 §16).
 *
 * The backend streams answers from `POST /chat/sessions/{id}/messages` as
 * `text/event-stream`. Because it is a POST (auth + body), the native
 * `EventSource` API — which only does GET — cannot be used; we read the
 * response body as a stream and parse SSE frames by hand.
 *
 * Frame contract (app/modules/ai/chat_service.py):
 *   event: token    data: { "text": "..." }
 *   event: citation data: { ...citation }
 *   event: done     data: { "message_id", "confidence": {score, level}, "latency_ms", "cached" }
 *
 * Mock mode does not use this module — callers keep their local simulator,
 * gated on `USE_MOCK` / `VITE_API_MODE`.
 */

import { getAccessToken, API_MODE } from './client';

const API_BASE_URL = (import.meta as any).env.VITE_PUBLIC_API_BASE_URL || '/api/mock/v1';

export interface ChatCitation {
  title?: string;
  document_id?: string;
  page?: number;
  snippet?: string;
  [k: string]: any;
}

export interface ChatDone {
  message_id: string;
  confidence?: { score: number; level: string };
  latency_ms?: number;
  cached?: boolean;
}

export interface StreamHandlers {
  onToken?: (text: string) => void;
  onCitation?: (citation: ChatCitation) => void;
  onDone?: (done: ChatDone) => void;
  onError?: (err: unknown) => void;
}

/**
 * Stream a copilot answer. Returns a function that aborts the stream.
 * Throws synchronously if invoked in mock mode (callers must branch on USE_MOCK).
 */
export function streamChatMessage(
  sessionId: string,
  content: string,
  handlers: StreamHandlers,
): () => void {
  if (API_MODE === 'mock') {
    throw new Error('streamChatMessage is live-mode only; use the mock simulator in mock mode.');
  }

  const controller = new AbortController();

  (async () => {
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE_URL}/chat/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ content }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Chat stream failed: HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line.
        let sep: number;
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          dispatchFrame(frame, handlers);
        }
      }
      if (buffer.trim()) dispatchFrame(buffer, handlers);
    } catch (err) {
      if ((err as any)?.name === 'AbortError') return;
      handlers.onError?.(err);
    }
  })();

  return () => controller.abort();
}

function dispatchFrame(frame: string, handlers: StreamHandlers): void {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  if (!dataLines.length) return;

  let data: any;
  try {
    data = JSON.parse(dataLines.join('\n'));
  } catch {
    return; // ignore malformed frames (e.g. keep-alive comments)
  }

  switch (event) {
    case 'token':
      handlers.onToken?.(data.text ?? '');
      break;
    case 'citation':
      handlers.onCitation?.(data as ChatCitation);
      break;
    case 'done':
      handlers.onDone?.(data as ChatDone);
      break;
  }
}
