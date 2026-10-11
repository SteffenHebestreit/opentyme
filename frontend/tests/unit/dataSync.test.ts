import { QueryObserver } from '@tanstack/react-query';
import { queryClient } from '../../src/lib/queryClient';
import { isDataWrite, notifyDataChanged } from '../../src/lib/dataSync';

const response = (method: string, url: string, status = 200) =>
  ({ config: { method, url }, status }) as Parameters<typeof isDataWrite>[0];

describe('isDataWrite', () => {
  it('counts successful POST, PUT, PATCH and DELETE as writes', () => {
    expect(isDataWrite(response('post', '/time-entries'))).toBe(true);
    expect(isDataWrite(response('put', '/projects/1'))).toBe(true);
    expect(isDataWrite(response('patch', '/invoices/1'))).toBe(true);
    expect(isDataWrite(response('delete', '/clients/1', 204))).toBe(true);
  });

  it('ignores reads', () => {
    expect(isDataWrite(response('get', '/time-entries'))).toBe(false);
  });

  it('ignores failed requests', () => {
    expect(isDataWrite(response('post', '/time-entries', 400))).toBe(false);
  });

  it('ignores POSTs that only compute or preview', () => {
    expect(isDataWrite(response('post', '/email-templates/42/preview'))).toBe(false);
    expect(isDataWrite(response('post', '/invoices/1/validate-payment'))).toBe(false);
    expect(isDataWrite(response('post', '/expenses/analyze-receipt'))).toBe(false);
    expect(isDataWrite(response('post', '/expenses/1/analyze-depreciation'))).toBe(false);
    expect(isDataWrite(response('post', '/settings/test-smtp'))).toBe(false);
    expect(isDataWrite(response('post', '/auth/logout'))).toBe(false);
    expect(isDataWrite(response('post', '/ai/chat'))).toBe(false);
  });
});

describe('notifyDataChanged', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    queryClient.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('marks derived business data (dashboard, analytics) as outdated, but not static data', () => {
    queryClient.setQueryData(['dashboard', 'summary'], { total: 1 });
    queryClient.setQueryData(['analytics', 'time-trend', 30], []);
    queryClient.setQueryData(['project-time-budgets'], []);
    queryClient.setQueryData(['plugins'], { plugins: [] });

    notifyDataChanged(false);
    jest.advanceTimersByTime(100); // past the debounce, well before cache GC

    const invalidated = (key: unknown[]) => queryClient.getQueryState(key)?.isInvalidated;
    expect(invalidated(['dashboard', 'summary'])).toBe(true);
    expect(invalidated(['analytics', 'time-trend', 30])).toBe(true);
    expect(invalidated(['project-time-budgets'])).toBe(true);
    expect(invalidated(['plugins'])).toBe(false);
  });

  it('refetches queries that are on screen', async () => {
    const queryFn = jest.fn().mockResolvedValue({ hours: 2 });
    const observer = new QueryObserver(queryClient, { queryKey: ['analytics', 'billable-ratio'], queryFn, staleTime: Infinity });
    const unsubscribe = observer.subscribe(() => undefined);
    await jest.runAllTimersAsync();
    expect(queryFn).toHaveBeenCalledTimes(1);

    notifyDataChanged(false);
    await jest.runAllTimersAsync();
    expect(queryFn).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('collapses a burst of writes into one refresh', async () => {
    const queryFn = jest.fn().mockResolvedValue([]);
    const observer = new QueryObserver(queryClient, { queryKey: ['timeEntries', 'list'], queryFn, staleTime: Infinity });
    const unsubscribe = observer.subscribe(() => undefined);
    await jest.runAllTimersAsync();

    notifyDataChanged(false);
    notifyDataChanged(false);
    notifyDataChanged(false);
    await jest.runAllTimersAsync();
    expect(queryFn).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});
