/**
 * A task and what can be done about it, by kind: confirm (done / reject),
 * upload, form, approval of an action (run / skip) and notice — plus what a
 * settled task still shows.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TaskCard } from '../../src/components/workflows/tasks/TaskCard';
import { toast } from '../../src/lib/toast';
import type { WorkflowTask } from '../../src/api/types/workflow.types';
import { task } from '../mocks/workflowFixtures';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options?.date || options?.type ? `${key}:${options.date ?? options.type}` : key),
    i18n: { language: 'en' },
  }),
}));

const mockConfirm = jest.fn();
jest.mock('../../src/lib/confirm', () => ({ confirmDialog: (...args: unknown[]) => mockConfirm(...args) }));
jest.mock('../../src/lib/toast', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockComplete = jest.fn();
const mockReject = jest.fn();
const mockApprove = jest.fn();
const mockSkip = jest.fn();
const mockDismiss = jest.fn();
jest.mock('../../src/hooks/api/useWorkflows', () => ({
  useCompleteWorkflowTask: () => ({ mutateAsync: mockComplete, isPending: false }),
  useRejectWorkflowTask: () => ({ mutateAsync: mockReject, isPending: false }),
  useApproveWorkflowTask: () => ({ mutateAsync: mockApprove, isPending: false }),
  useSkipWorkflowTask: () => ({ mutateAsync: mockSkip, isPending: false }),
  useDismissWorkflowTask: () => ({ mutateAsync: mockDismiss, isPending: false }),
}));

const renderTask = (overrides: Partial<WorkflowTask>, hideRunLink = false) => {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <TaskCard task={task(overrides)} hideRunLink={hideRunLink} />
    </MemoryRouter>
  );
  return user;
};

beforeEach(() => {
  jest.clearAllMocks();
  for (const mock of [mockComplete, mockReject, mockApprove, mockSkip, mockDismiss]) mock.mockResolvedValue({});
  mockConfirm.mockResolvedValue(true);
});

it('says which flow and subject a task belongs to and links to its run', () => {
  renderTask({ kind: 'confirm', title: 'Check the invoice', description: 'Totals and period', test_mode: true });
  const card = screen.getByRole('article', { name: 'Check the invoice' });
  expect(within(card).getByText('Totals and period')).toBeInTheDocument();
  expect(within(card).getByText('Timesheet with signature · ACME GmbH')).toBeInTheDocument();
  expect(within(card).getByText('testRun.badge')).toBeInTheDocument();
  expect(within(card).getByRole('link', { name: 'tasks.openRun' })).toHaveAttribute('href', '/workflows/runs/run-1');
});

describe('confirm', () => {
  it('completes with the comment', async () => {
    const user = renderTask({ kind: 'confirm', title: 'Check the invoice' });
    await user.type(screen.getByLabelText('tasks.confirm.comment'), 'All good');
    await user.click(screen.getByRole('button', { name: 'tasks.confirm.done' }));
    expect(mockComplete).toHaveBeenCalledWith({ id: 'task-1', payload: { comment: 'All good' } });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('tasks.completed'));
  });

  it('rejects only after confirming — it may cancel the run', async () => {
    mockConfirm.mockResolvedValueOnce(false);
    const user = renderTask({ kind: 'confirm', title: 'Check the invoice' });
    await user.click(screen.getByRole('button', { name: 'tasks.confirm.reject' }));
    expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({ tone: 'danger' }));
    expect(mockReject).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'tasks.confirm.reject' }));
    expect(mockReject).toHaveBeenCalledWith({ id: 'task-1', comment: '' });
  });
});

describe('upload', () => {
  it('uploads the chosen file with its title', async () => {
    const user = renderTask({ kind: 'upload' });
    expect(screen.getByText('tasks.upload.storedAs:clients:documents.types.timesheet_signed')).toBeInTheDocument();
    const file = new File(['%PDF-1.7'], 'signed.pdf', { type: 'application/pdf' });
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, file);
    await user.type(screen.getByLabelText('tasks.upload.title'), 'Signed October');
    await user.click(screen.getByRole('button', { name: 'tasks.upload.submit' }));
    expect(mockComplete).toHaveBeenCalledWith({ id: 'task-1', payload: { file, title: 'Signed October' } });
  });

  it('asks for a file and refuses unsupported ones', async () => {
    const user = renderTask({ kind: 'upload' });
    await user.click(screen.getByRole('button', { name: 'tasks.upload.submit' }));
    expect(screen.getByText('tasks.upload.errors.required')).toBeInTheDocument();
    expect(mockComplete).not.toHaveBeenCalled();

    const exe = new File(['MZ'], 'setup.exe', { type: 'application/x-msdownload' });
    await userEvent.setup({ applyAccept: false }).upload(document.querySelector('input[type="file"]') as HTMLInputElement, exe);
    expect(screen.getByText('tasks.upload.errors.type')).toBeInTheDocument();
  });
});

describe('form', () => {
  const fields = [
    { key: 'po', label: 'PO number', type: 'text', required: true },
    { key: 'amount', label: 'Amount', type: 'number' },
    { key: 'urgent', label: 'Urgent', type: 'boolean' },
  ];

  it('requires what the flow marked as required', async () => {
    const user = renderTask({ kind: 'form', title: 'Order details', payload: { fields } });
    await user.click(screen.getByRole('button', { name: 'tasks.form.submit' }));
    expect(screen.getByText('tasks.form.required')).toBeInTheDocument();
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it('sends the values with their types', async () => {
    const user = renderTask({ kind: 'form', title: 'Order details', payload: { fields } });
    await user.type(screen.getByLabelText(/PO number/), 'A-17');
    await user.type(screen.getByLabelText('Amount'), '12.5');
    await user.click(screen.getByLabelText('Urgent'));
    await user.click(screen.getByRole('button', { name: 'tasks.form.submit' }));
    expect(mockComplete).toHaveBeenCalledWith({ id: 'task-1', payload: { values: { po: 'A-17', amount: 12.5, urgent: true } } });
  });
});

describe('approval', () => {
  const payload = {
    action: 'email.send',
    preview: [
      { label: 'To', value: 'billing@acme.example' },
      { label: 'Attachments', value: ['invoice-2026-10.pdf', 'signed.pdf'] },
    ],
  };

  it('shows what is about to happen and runs it on approval', async () => {
    const user = renderTask({ kind: 'approval', title: 'Send the invoice', payload });
    expect(screen.getByText('billing@acme.example')).toBeInTheDocument();
    expect(screen.getByText('invoice-2026-10.pdf, signed.pdf')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'tasks.approval.approve' }));
    expect(mockApprove).toHaveBeenCalledWith('task-1');
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('tasks.approved'));
  });

  it('skips the action after a confirmation', async () => {
    const user = renderTask({ kind: 'approval', title: 'Send the invoice', payload });
    await user.click(screen.getByRole('button', { name: 'tasks.approval.skip' }));
    expect(mockConfirm).toHaveBeenCalled();
    expect(mockSkip).toHaveBeenCalledWith('task-1');
    expect(mockApprove).not.toHaveBeenCalled();
  });

  it('tells the server’s reason when it fails', async () => {
    mockApprove.mockRejectedValue({ response: { status: 409, data: { message: 'The task is already settled.' } } });
    const user = renderTask({ kind: 'approval', title: 'Send the invoice', payload });
    await user.click(screen.getByRole('button', { name: 'tasks.approval.approve' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('tasks.actionError', { description: 'The task is already settled.' }));
    expect(toast.success).not.toHaveBeenCalled();
  });
});

it('dismisses a notice', async () => {
  const user = renderTask({ kind: 'notice', title: 'Invoice 2026-10-003 was sent' });
  await user.click(screen.getByRole('button', { name: 'tasks.notice.dismiss' }));
  expect(mockDismiss).toHaveBeenCalledWith('task-1');
});

it('shows a due date, and that it has passed', () => {
  renderTask({ kind: 'confirm', due_at: '2020-01-15T12:00:00Z' });
  expect(screen.getByText(/^tasks\.overdueSince:/)).toBeInTheDocument();
});

it('offers nothing to do for a settled task', () => {
  renderTask({ kind: 'confirm', status: 'done', completed_at: '2026-11-12T10:00:00Z' }, true);
  expect(screen.getByText('taskStatus.done')).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'tasks.openRun' })).not.toBeInTheDocument();
});
