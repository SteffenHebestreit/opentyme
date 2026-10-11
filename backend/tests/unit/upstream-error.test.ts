import { each } from '../helpers/table';
import { classifyUpstreamError } from '../../src/utils/upstream-error';

/** Build an error shaped like the ones axios / Node throw. */
function netError(message: string, extra: Record<string, unknown>): Error {
  return Object.assign(new Error(message), extra);
}

describe('classifyUpstreamError', () => {
  each([
    ['ECONNREFUSED', 'connect ECONNREFUSED 10.0.0.2:1234'],
    ['ENOTFOUND', 'getaddrinfo ENOTFOUND mcp-server'],
    ['EAI_AGAIN', 'getaddrinfo EAI_AGAIN llm'],
    ['EHOSTUNREACH', 'connect EHOSTUNREACH 10.0.0.2:1234'],
    ['ENETUNREACH', 'connect ENETUNREACH 10.0.0.2:1234'],
    ['ECONNRESET', 'socket hang up'],
  ])('treats %s as unreachable', (code, message) => {
    expect(classifyUpstreamError(netError(message, { code }))).toEqual({ kind: 'unreachable', code });
  });

  it('treats an axios response timeout (ECONNABORTED) as timeout', () => {
    const error = netError('timeout of 180000ms exceeded', { code: 'ECONNABORTED' });
    expect(classifyUpstreamError(error).kind).toBe('timeout');
  });

  it('treats a clarified axios timeout (ETIMEDOUT) as timeout', () => {
    const error = netError('timeout of 5000ms exceeded', { code: 'ETIMEDOUT' });
    expect(classifyUpstreamError(error).kind).toBe('timeout');
  });

  it('treats a TCP connect timeout as unreachable', () => {
    const error = netError('connect ETIMEDOUT 10.0.0.2:1234', { code: 'ETIMEDOUT', syscall: 'connect' });
    expect(classifyUpstreamError(error).kind).toBe('unreachable');
  });

  it('treats an aborted request without timeout as unreachable', () => {
    const error = netError('Request aborted', { code: 'ECONNABORTED' });
    expect(classifyUpstreamError(error).kind).toBe('unreachable');
  });

  it('reads the code from a fetch/undici cause', () => {
    const error = netError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    expect(classifyUpstreamError(error).kind).toBe('unreachable');
  });

  it('classifies HTTP answers by status', () => {
    expect(classifyUpstreamError({ response: { status: 401 } })).toEqual({ kind: 'auth', status: 401 });
    expect(classifyUpstreamError({ response: { status: 403 } })).toEqual({ kind: 'auth', status: 403 });
    expect(classifyUpstreamError({ response: { status: 404 } })).toEqual({ kind: 'http', status: 404 });
    expect(classifyUpstreamError({ response: { status: 500 } })).toEqual({ kind: 'http', status: 500 });
  });

  it('falls back to other', () => {
    expect(classifyUpstreamError(new SyntaxError('Unexpected token')).kind).toBe('other');
    expect(classifyUpstreamError(undefined).kind).toBe('other');
  });
});
