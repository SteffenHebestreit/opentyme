/**
 * @fileoverview Classification of failed outbound HTTP calls to user-configured
 * upstream services (OpenAI-compatible LLM server, document converter, STT).
 *
 * Callers turn the result into a stable error `code` for the client instead of
 * forwarding the raw upstream message, which can carry internal hostnames.
 */

export type UpstreamFailureKind =
  /** Connection refused, DNS failure, host/network unreachable, TCP connect timeout. */
  | 'unreachable'
  /** The server accepted the connection but did not answer within our timeout. */
  | 'timeout'
  /** The server answered 401 or 403. */
  | 'auth'
  /** The server answered with any other non-2xx status. */
  | 'http'
  /** Anything else (programming errors, parse errors, …). */
  | 'other';

export interface UpstreamFailure {
  kind: UpstreamFailureKind;
  /** HTTP status when the server answered. */
  status?: number;
  /** Node / axios error code, e.g. ECONNREFUSED or ECONNABORTED. */
  code?: string;
}

const UNREACHABLE_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'EHOSTDOWN',
  'ENETUNREACH',
  'ENETDOWN',
  'ECONNRESET',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

const UNREACHABLE_PATTERN =
  /\b(ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|EHOSTDOWN|ENETUNREACH|ENETDOWN|ECONNRESET)\b/;

/**
 * Classify an error thrown by axios (or fetch/undici) for an outbound request.
 *
 * Timeouts: axios reports its own response timeout as ECONNABORTED (or
 * ETIMEDOUT with `transitional.clarifyTimeoutError`), always with a
 * "timeout of N ms exceeded" message — that is a `timeout`. An OS-level
 * `connect ETIMEDOUT` means the host never answered the TCP handshake, which
 * is `unreachable`. A bare ECONNABORTED without a timeout message (connection
 * aborted mid-request) is treated as `unreachable` as well.
 */
export function classifyUpstreamError(error: unknown): UpstreamFailure {
  const err = (error ?? {}) as {
    code?: unknown;
    message?: unknown;
    syscall?: unknown;
    name?: unknown;
    response?: { status?: unknown };
    cause?: { code?: unknown; message?: unknown; syscall?: unknown };
  };

  const status = typeof err.response?.status === 'number' ? err.response.status : undefined;
  if (status !== undefined) {
    if (status === 401 || status === 403) return { kind: 'auth', status };
    return { kind: 'http', status };
  }

  const code =
    (typeof err.code === 'string' && err.code) ||
    (typeof err.cause?.code === 'string' && err.cause.code) ||
    undefined;
  const message = `${typeof err.message === 'string' ? err.message : ''} ${
    typeof err.cause?.message === 'string' ? err.cause.message : ''
  }`;
  const syscall = err.syscall ?? err.cause?.syscall;
  const timeoutMessage = /timeout of \d+ ?ms exceeded|timed? ?out/i.test(message);

  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') {
    const connectPhase = syscall === 'connect' || /\bconnect ETIMEDOUT\b/.test(message);
    if (!connectPhase && (timeoutMessage || code !== 'ECONNABORTED')) {
      return { kind: 'timeout', code };
    }
    return { kind: 'unreachable', code };
  }

  if (err.name === 'TimeoutError') return { kind: 'timeout', code };

  if ((code && UNREACHABLE_CODES.has(code)) || UNREACHABLE_PATTERN.test(message)) {
    return { kind: 'unreachable', code };
  }

  return { kind: 'other', code };
}
