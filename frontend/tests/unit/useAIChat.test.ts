import { act, renderHook, waitFor } from '@testing-library/react';
import { useAIChat } from '../../src/api/hooks/useAIChat';
import { approveActions, getConversation, streamChat } from '../../src/api/services/ai-chat.service';
import { notifyDataChanged } from '../../src/lib/dataSync';

jest.mock('../../src/api/services/ai-chat.service', () => ({
  streamChat: jest.fn(),
  approveActions: jest.fn(),
  getConversation: jest.fn(),
}));
jest.mock('../../src/lib/dataSync', () => ({ notifyDataChanged: jest.fn() }));

const pendingConversation = {
  id: 'c-1',
  title: null,
  created_at: '',
  updated_at: '',
  messages: [
    { id: 'u1', role: 'user', content: 'Log 2h', created_at: '' },
    {
      id: 'batch-1',
      role: 'assistant',
      content: 'I will log 2 hours.',
      created_at: '',
      metadata: {
        status: 'awaiting_approval',
        pending: [{ id: 'call-1', type: 'function', function: { name: 'log_time_entry', arguments: '{"hours":2}' } }],
      },
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

describe('useAIChat', () => {
  it('restores a pending approval with its batch id after a reload', async () => {
    localStorage.setItem('ai_chat_thread_id', 'c-1');
    (getConversation as jest.Mock).mockResolvedValue(pendingConversation);
    const { result } = renderHook(() => useAIChat());
    await waitFor(() => expect(result.current.pendingApproval).not.toBeNull());
    expect(result.current.pendingApproval).toMatchObject({ batchId: 'batch-1', actions: [{ toolCallId: 'call-1', toolName: 'log_time_entry', arguments: { hours: 2 } }] });
  });

  it('brings the approval card back when the approve request is rejected before the run starts', async () => {
    localStorage.setItem('ai_chat_thread_id', 'c-1');
    (getConversation as jest.Mock).mockResolvedValue(pendingConversation);
    (approveActions as jest.Mock).mockResolvedValue({
      threadId: null,
      started: false,
      aborted: false,
      error: { kind: 'rate_limit', message: 'Too many requests' },
    });
    const { result } = renderHook(() => useAIChat());
    await waitFor(() => expect(result.current.pendingApproval).not.toBeNull());

    await act(async () => {
      await result.current.approve([{ toolCallId: 'call-1', decision: 'approve' }]);
    });

    expect(approveActions).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'c-1', batchId: 'batch-1' }));
    expect(result.current.pendingApproval?.batchId).toBe('batch-1');
    expect(result.current.error).toBe('Too many requests');
    expect(result.current.isStreaming).toBe(false);
  });

  it('refreshes app data after approving — even when the stream breaks off afterwards', async () => {
    localStorage.setItem('ai_chat_thread_id', 'c-1');
    (getConversation as jest.Mock).mockResolvedValue(pendingConversation);
    (approveActions as jest.Mock).mockResolvedValue({
      threadId: 'c-1',
      started: true,
      aborted: false,
      error: { kind: 'network', message: 'Connection lost' },
    });
    const { result } = renderHook(() => useAIChat());
    await waitFor(() => expect(result.current.pendingApproval).not.toBeNull());

    await act(async () => {
      await result.current.approve([{ toolCallId: 'call-1', decision: 'approve' }]);
    });

    expect(notifyDataChanged).toHaveBeenCalled();
    // The server took the approval — the card must not come back
    expect(result.current.pendingApproval).toBeNull();
  });

  it('does not refresh app data when everything was rejected', async () => {
    localStorage.setItem('ai_chat_thread_id', 'c-1');
    (getConversation as jest.Mock).mockResolvedValue(pendingConversation);
    (approveActions as jest.Mock).mockResolvedValue({ threadId: 'c-1', started: true, aborted: false });
    const { result } = renderHook(() => useAIChat());
    await waitFor(() => expect(result.current.pendingApproval).not.toBeNull());

    await act(async () => {
      await result.current.approve([{ toolCallId: 'call-1', decision: 'reject' }]);
    });
    expect(notifyDataChanged).not.toHaveBeenCalled();
  });

  it('marks a message that never reached the server and can resend it', async () => {
    (streamChat as jest.Mock)
      .mockResolvedValueOnce({ threadId: null, started: false, aborted: false, error: { kind: 'network', message: 'Offline' } })
      .mockResolvedValueOnce({ threadId: 't-9', started: true, aborted: false });
    const { result } = renderHook(() => useAIChat());

    await act(async () => {
      await result.current.sendMessage('How many hours this week?');
    });
    const failed = result.current.messages.find((m) => m.role === 'user');
    expect(failed).toMatchObject({ failed: true, content: 'How many hours this week?' });
    expect(result.current.error).toBe('Offline');

    await act(async () => {
      result.current.retryMessage(failed!.id);
    });
    await waitFor(() => expect(streamChat).toHaveBeenCalledTimes(2));
    expect(result.current.messages.filter((m) => m.role === 'user')).toHaveLength(1);
    expect(result.current.messages[0].failed).toBeUndefined();
  });

  it('shows no error when the user stops a run', async () => {
    (streamChat as jest.Mock).mockResolvedValue({ threadId: null, started: false, aborted: true });
    const { result } = renderHook(() => useAIChat());
    await act(async () => {
      await result.current.sendMessage('Hello');
    });
    expect(result.current.error).toBeNull();
    expect(result.current.isStreaming).toBe(false);
  });

  it('translates server error codes', async () => {
    (streamChat as jest.Mock).mockImplementation(async ({ onEvent }) => {
      onEvent({ type: 'RUN_STARTED', threadId: 't-1' });
      onEvent({ type: 'RUN_ERROR', code: 'LLM_UNREACHABLE', message: 'connect ECONNREFUSED 10.0.0.1:1234' });
      return { threadId: 't-1', started: true, aborted: false };
    });
    const { result } = renderHook(() => useAIChat());
    await act(async () => {
      await result.current.sendMessage('Hello');
    });
    expect(result.current.error).toMatch(/not reachable|nicht erreichbar/);
    expect(result.current.error).not.toContain('ECONNREFUSED');
  });
});
