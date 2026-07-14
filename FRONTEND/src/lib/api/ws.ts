/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Real-time WebSocket client (docs/02 §35).
 *
 * A single tenant-scoped connection to `${WS_URL}?token=<access JWT>` multiplexes
 * every server-push event by `type`:
 *   { type: "connected", tenant_id }
 *   { type: "ingestion.progress", job_id, stage, pct, detail }
 *   { type: "rca.progress", failure_id, stage, pct }
 *   { type: "compliance.scan.progress" | "compliance.evidence.progress", ... }
 *   { type: "notification.created", ... }   // and other domain events
 *
 * Callers subscribe by event type (or "*" for all). The socket auto-reconnects
 * with backoff and re-attaches the current access token on each attempt.
 *
 * Mock mode never opens a socket — stores keep their local simulators, gated on
 * `USE_MOCK` / `VITE_API_MODE`.
 */

import { getAccessToken, WS_URL, USE_MOCK } from './client';

export interface WsMessage {
  type: string;
  [k: string]: any;
}

type Listener = (msg: WsMessage) => void;

class RealtimeClient {
  private socket: WebSocket | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closedByUser = false;

  connect(): void {
    if (USE_MOCK) return;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const token = getAccessToken();
    if (!token) return; // wait until authenticated

    this.closedByUser = false;
    const url = `${WS_URL}?token=${encodeURIComponent(token)}`;
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectAttempts = 0;
    };

    socket.onmessage = (ev) => {
      let msg: WsMessage;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      this.emit(msg.type, msg);
      this.emit('*', msg);
    };

    socket.onclose = (ev) => {
      this.socket = null;
      // 4401 = unauthorized (bad/expired token). Don't hammer; wait for a fresh
      // login to call connect() again.
      if (this.closedByUser || ev.code === 4401) return;
      this.scheduleReconnect();
    };

    socket.onerror = () => {
      try { socket.close(); } catch { /* noop */ }
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(30_000, 1000 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  disconnect(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      try { this.socket.close(); } catch { /* noop */ }
      this.socket = null;
    }
  }

  /** Subscribe to an event type ("*" for all). Returns an unsubscribe fn. */
  on(type: string, listener: Listener): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
    return () => set!.delete(listener);
  }

  private emit(type: string, msg: WsMessage): void {
    this.listeners.get(type)?.forEach((l) => {
      try { l(msg); } catch { /* swallow listener errors */ }
    });
  }
}

export const realtime = new RealtimeClient();
