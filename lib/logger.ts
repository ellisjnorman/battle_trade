/**
 * Centralized logger for Battle Trade.
 *
 * In development: logs to console with structured context.
 * In production: sends errors to external service (Sentry, LogFlare, etc.)
 * when configured via NEXT_PUBLIC_SENTRY_DSN env var.
 *
 * All API routes and critical paths should use this instead of console.log/error.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  lobbyId?: string;
  traderId?: string;
  roundId?: string;
  route?: string;
  action?: string;
  [key: string]: unknown;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: { message: string; stack?: string; name: string };
  timestamp: string;
}

// In-memory ring buffer for recent errors (viewable via /api/health)
const ERROR_BUFFER_SIZE = 100;
const recentErrors: LogEntry[] = [];

function addToBuffer(entry: LogEntry) {
  recentErrors.push(entry);
  if (recentErrors.length > ERROR_BUFFER_SIZE) recentErrors.shift();
}

function formatEntry(entry: LogEntry): string {
  const ctx = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
  const err = entry.error ? ` [${entry.error.name}: ${entry.error.message}]` : '';
  return `[${entry.level.toUpperCase()}] ${entry.message}${ctx}${err}`;
}

function serializeError(err: unknown): { message: string; stack?: string; name: string } | undefined {
  if (!err) return undefined;
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack, name: err.name };
  }
  return { message: String(err), name: 'Unknown' };
}

function log(level: LogLevel, message: string, context?: LogContext, err?: unknown) {
  const entry: LogEntry = {
    level,
    message,
    context,
    error: serializeError(err),
    timestamp: new Date().toISOString(),
  };

  // Always log errors and warns
  if (level === 'error') {
    console.error(formatEntry(entry));
    addToBuffer(entry);
    reportToExternalService(entry);
  } else if (level === 'warn') {
    console.warn(formatEntry(entry));
    addToBuffer(entry);
  } else if (level === 'info') {
    console.info(formatEntry(entry));
  } else if (process.env.NODE_ENV !== 'production') {
    console.debug(formatEntry(entry));
  }
}

/** Send to external error tracking (Sentry, LogFlare, etc.) */
function reportToExternalService(entry: LogEntry) {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  // Lightweight Sentry-compatible POST (no SDK dependency)
  // This is a fire-and-forget — don't await
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace('/', '');
    const publicKey = url.username;
    const host = url.hostname;

    const envelope = JSON.stringify({
      event_id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
      timestamp: entry.timestamp,
      level: entry.level,
      message: { formatted: entry.message },
      extra: entry.context,
      exception: entry.error ? {
        values: [{ type: entry.error.name, value: entry.error.message, stacktrace: entry.error.stack }],
      } : undefined,
    });

    fetch(`https://${host}/api/${projectId}/store/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${publicKey}`,
      },
      body: envelope,
    }).catch(() => {}); // truly fire-and-forget
  } catch {
    // Don't let error reporting cause errors
  }
}

export const logger = {
  debug: (msg: string, ctx?: LogContext) => log('debug', msg, ctx),
  info: (msg: string, ctx?: LogContext) => log('info', msg, ctx),
  warn: (msg: string, ctx?: LogContext, err?: unknown) => log('warn', msg, ctx, err),
  error: (msg: string, ctx?: LogContext, err?: unknown) => log('error', msg, ctx, err),

  /** Get recent errors for health check endpoint */
  getRecentErrors: () => [...recentErrors],
  getErrorCount: () => recentErrors.length,
};
