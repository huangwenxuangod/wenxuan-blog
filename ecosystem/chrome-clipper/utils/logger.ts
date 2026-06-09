export type LogLevel = 'info' | 'warn' | 'error';

export interface DiagnosticError {
  code: string;
  phase: string;
  message: string;
  errorId: string;
  details?: string;
  hint?: string;
  requestId?: string;
}

interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  event: string;
  operationId?: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

const LOG_STORAGE_KEY = 'diagnosticLogs';
const MAX_LOG_ENTRIES = 200;
let writeQueue: Promise<void> = Promise.resolve();

function createId(prefix: string): string {
  const value = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${value}`;
}

function serializeError(error: unknown): LogEntry['error'] | undefined {
  if (!error) return undefined;
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return {
    name: 'UnknownError',
    message: String(error),
  };
}

function sanitize(value: unknown, key = ''): unknown {
  const sensitiveKeys = new Set([
    'token',
    'apitoken',
    'authorization',
    'password',
    'content',
    'markdown',
    'cookie',
  ]);
  if (sensitiveKeys.has(key.toLowerCase())) return '[REDACTED]';
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitize(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 40)
        .map(([entryKey, entryValue]) => [entryKey, sanitize(entryValue, entryKey)]),
    );
  }
  if (typeof value === 'string' && value.length > 500) return `${value.slice(0, 500)}…`;
  return value;
}

export function createOperationId(): string {
  return createId('op');
}

export async function writeLog(
  level: LogLevel,
  event: string,
  options: {
    operationId?: string;
    context?: Record<string, unknown>;
    error?: unknown;
  } = {},
): Promise<string> {
  const entry: LogEntry = {
    id: createId('log'),
    timestamp: new Date().toISOString(),
    level,
    event,
    operationId: options.operationId,
    context: options.context ? sanitize(options.context) as Record<string, unknown> : undefined,
    error: serializeError(options.error),
  };

  console[level]('[Wenxuan Clipper]', entry);

  writeQueue = writeQueue
    .catch(() => undefined)
    .then(async () => {
      const stored = await chrome.storage.local.get(LOG_STORAGE_KEY);
      const current = Array.isArray(stored[LOG_STORAGE_KEY])
        ? stored[LOG_STORAGE_KEY] as LogEntry[]
        : [];
      await chrome.storage.local.set({
        [LOG_STORAGE_KEY]: [...current, entry].slice(-MAX_LOG_ENTRIES),
      });
    })
    .catch((storageError) => {
      console.warn('[Wenxuan Clipper] Failed to persist diagnostic log', storageError);
    });
  await writeQueue;
  return entry.id;
}

export async function reportDiagnosticError(options: {
  code: string;
  phase: string;
  message: string;
  operationId?: string;
  details?: string;
  hint?: string;
  requestId?: string;
  context?: Record<string, unknown>;
  error?: unknown;
}): Promise<DiagnosticError> {
  const errorId = await writeLog('error', options.code, {
    operationId: options.operationId,
    context: {
      phase: options.phase,
      message: options.message,
      details: options.details,
      hint: options.hint,
      requestId: options.requestId,
      ...options.context,
    },
    error: options.error,
  });

  return {
    code: options.code,
    phase: options.phase,
    message: options.message,
    errorId,
    details: options.details,
    hint: options.hint,
    requestId: options.requestId,
  };
}

export async function getDiagnosticLogs(): Promise<string> {
  await writeQueue.catch(() => undefined);
  const stored = await chrome.storage.local.get(LOG_STORAGE_KEY);
  const logs = Array.isArray(stored[LOG_STORAGE_KEY]) ? stored[LOG_STORAGE_KEY] : [];
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    extension: 'Wenxuan Blog Clipper',
    logs,
  }, null, 2);
}

export async function clearDiagnosticLogs(): Promise<void> {
  await chrome.storage.local.remove(LOG_STORAGE_KEY);
}
