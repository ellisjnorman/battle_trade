'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ---------------------------------------------------------------------------
// Online/offline detection hook
// ---------------------------------------------------------------------------

const PING_INTERVAL_MS = 10_000; // check every 10 seconds
const PING_TIMEOUT_MS = 5_000;

/**
 * Returns `true` when the browser has a working connection to the server,
 * `false` otherwise. Uses both `navigator.onLine` and a periodic fetch
 * heartbeat so we catch "connected to WiFi but no internet" scenarios.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkConnectivity = useCallback(async () => {
    if (!navigator.onLine) {
      setOnline(false);
      return;
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
      await fetch('/api/market-data', {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      // Replay queued actions when we come back online
      replayQueue().then(({ succeeded, failed }) => {
        if (succeeded > 0 || failed > 0) {
          console.log(`[offline] replayed queue: ${succeeded} succeeded, ${failed} failed`);
        }
      });
    };
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Listen for service worker broadcasts
    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === 'BT_CONNECTION_STATUS') {
        setOnline(event.data.online);
      }
    };
    navigator.serviceWorker?.addEventListener('message', handleSWMessage);

    // Periodic heartbeat
    intervalRef.current = setInterval(checkConnectivity, PING_INTERVAL_MS);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      navigator.serviceWorker?.removeEventListener('message', handleSWMessage);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [checkConnectivity]);

  return online;
}

// ---------------------------------------------------------------------------
// Offline action queue — persisted in localStorage
// ---------------------------------------------------------------------------

const QUEUE_KEY = 'bt_offline_queue';

export interface QueuedAction {
  id: string;
  url: string;
  method: string;
  body: string;
  timestamp: number;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Enqueue a network action to be replayed when connectivity returns.
 * Typically called from fetch wrappers when a POST/PUT/DELETE fails due
 * to a network error.
 */
export function queueAction(action: Omit<QueuedAction, 'id' | 'timestamp'>): void {
  const queue = getQueuedActions();
  const entry: QueuedAction = {
    ...action,
    id: generateId(),
    timestamp: Date.now(),
  };
  queue.push(entry);
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.warn('[offline] failed to persist queue', err);
  }
}

/**
 * Retrieve all currently queued actions, ordered by timestamp ascending.
 */
export function getQueuedActions(): QueuedAction[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as QueuedAction[];
  } catch {
    return [];
  }
}

/**
 * Replay every queued action sequentially (preserving order).
 * Successfully replayed actions are removed from the queue; failures remain
 * so they can be retried on the next connectivity window.
 */
export async function replayQueue(): Promise<{ succeeded: number; failed: number }> {
  const queue = getQueuedActions();
  if (queue.length === 0) return { succeeded: 0, failed: 0 };

  let succeeded = 0;
  let failed = 0;
  const remaining: QueuedAction[] = [];

  for (const action of queue) {
    try {
      const response = await fetch(action.url, {
        method: action.method,
        headers: { 'Content-Type': 'application/json' },
        body: action.body,
      });
      if (response.ok) {
        succeeded++;
      } else {
        // Server rejected the request (e.g. 400/409) — don't retry, drop it
        console.warn(
          `[offline] replayed action ${action.id} returned ${response.status}, discarding`
        );
        succeeded++;
      }
    } catch {
      // Network still down or transient failure — keep for next replay
      failed++;
      remaining.push(action);
    }
  }

  try {
    if (remaining.length === 0) {
      localStorage.removeItem(QUEUE_KEY);
    } else {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
    }
  } catch (err) {
    console.warn('[offline] failed to update queue after replay', err);
  }

  return { succeeded, failed };
}

/**
 * Drop all queued actions. Use with caution — data will be lost.
 */
export function clearQueue(): void {
  try {
    localStorage.removeItem(QUEUE_KEY);
  } catch {
    // noop — localStorage unavailable
  }
}
