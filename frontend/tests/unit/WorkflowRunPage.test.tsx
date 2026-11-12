/**
 * The run view: header, the canvas with each node's state, the run's open
 * tasks, the history of steps — and resolving an incident (retry / skip) or
 * cancelling the run.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import WorkflowRunPage from '../../src/pages/workflows/WorkflowRunPage';
import type { WorkflowRun } from '../../src/api/types/workflow.types';
import { run, step } from '../mocks/workflowFixtures';
import { mockReactFlowDom } from '../mocks/reactFlowDom';

mockReactFlowDom();

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (typeof options?.step === 'string' ? `${key}:${options.step}` : key),
    i18n: { language: 'en' },
  }),
}));
jest.mock('../../src/store/AppContext', () => ({ useApp: () => ({ state: { theme: 'light' } }) }));
jest.mock('../../src/lib/toast', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
const mockConfirm = jest.fn();
jest.mock('../../src/lib/confirm', () => ({ confirmDialog: (...args: unknown[]) => mockConfirm(...args) }));
jest.mock('../../src/components/workflows/tasks/TaskCard', () => ({
  TaskCard: ({ task }: { task: { title: string } }) => <div data-testid="task-card">{task.title}</div>,
}));

const mockRun = jest.fn();
const mockCancel = jest.fn();
const mockRetry = jest.fn();
const mockSkip = jest.fn();
jest.mock('../../src/hooks/api/useWorkflows', () => ({
  useWorkflowRun: () => mockRun(),
  useWorkflowCatalog: () => ({ data: jest.requireActual('../mocks/workflowFixtures').catalog }),
  useCancelWorkflowRun: () => ({ mutateAsync: mockCancel, isPending: false }),
  useRetryWorkflowStep: () => ({ mutateAsync: mockRetry, isPending: false }),
  useSkipWorkflowStep: () => ({ mutateAsync: mockSkip, isPending: false }),
}));

function renderPage(data: WorkflowRun | undefined, state: { isLoading?: boolean; isError?: boolean } = {}) {
  mockRun.mockReturnValue({ data, isLoading: false, isError: false, ...state });
  render(
    <MemoryRouter initialEntries={['/workflows/runs/run-1']}>
      <Routes>
        <Route path="/workflows/runs/:id" element={<WorkflowRunPage />} />
      </Routes>
    </MemoryRouter>
  );
  return userEvent.setup();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockConfirm.mockResolvedValue(true);
  for (const mock of [mockCancel, mockRetry, mockSkip]) mock.mockResolvedValue({});
});

it('shows where a waiting run stands', () => {
  renderPage(run());
  expect(screen.getByRole('heading', { level: 1, name: 'Timesheet with signature' })).toBeInTheDocument();
  expect(screen.getByText('runStatus.waiting')).toBeInTheDocument();
  expect(screen.getByText('ACME GmbH')).toBeInTheDocument();

  // the run's open task is right there
  expect(screen.getByTestId('task-card')).toHaveTextContent('Upload the signed timesheet');

  // canvas: visited nodes carry their state, the task is the one waiting
  const canvas = screen.getByRole('region', { name: 'run.progress' });
  expect(canvas.querySelectorAll('[data-run-status="completed"]')).toHaveLength(5);
  expect(canvas.querySelectorAll('[data-run-status="waiting"]')).toHaveLength(1);

  // history: every step in order, the gateway with the exit it took
  const history = screen.getByRole('region', { name: 'run.history' });
  expect(within(history).getAllByRole('listitem')).toHaveLength(6);
  expect(within(history).getByText('Hours logged?')).toBeInTheDocument();
  expect(within(history).getByText(/run\.outcome/)).toBeInTheDocument();

  // no incident → nothing to retry
  expect(screen.queryByRole('button', { name: 'run.retry' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'run.cancel' })).toBeEnabled();
});

describe('incident', () => {
  const incident = () =>
    run({
      status: 'incident',
      tasks: [],
      steps: [
        ...run().steps.slice(0, 4),
        step({ id: 'step-5', node_id: 'n5', seq: 5, status: 'failed', outcome: null, error: 'SMTP connection refused', finished_at: null }),
      ],
    });

  it('names the failed step and its error', () => {
    renderPage(incident());
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('run.incidentTitle:Timesheet to client');
    expect(alert).toHaveTextContent('SMTP connection refused');
  });

  it('retries the failed step after a confirmation', async () => {
    const user = renderPage(incident());
    await user.click(screen.getByRole('button', { name: 'run.retry' }));
    expect(mockConfirm).toHaveBeenCalled();
    await waitFor(() => expect(mockRetry).toHaveBeenCalledWith({ runId: 'run-1', stepId: 'step-5' }));
  });

  it('skips the failed step — or leaves it when the question is declined', async () => {
    mockConfirm.mockResolvedValueOnce(false);
    const user = renderPage(incident());
    await user.click(screen.getByRole('button', { name: 'run.skip' }));
    expect(mockSkip).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'run.skip' }));
    await waitFor(() => expect(mockSkip).toHaveBeenCalledWith({ runId: 'run-1', stepId: 'step-5' }));
  });
});

it('cancels a run after a confirmation', async () => {
  const user = renderPage(run());
  await user.click(screen.getByRole('button', { name: 'run.cancel' }));
  expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({ tone: 'danger' }));
  await waitFor(() => expect(mockCancel).toHaveBeenCalledWith('run-1'));
});

it('offers no actions on a finished run and shows its result', () => {
  renderPage(run({ status: 'completed', tasks: [], result: 'Invoice 2026-10-003 sent', ended_at: '2026-11-13T10:00:00Z' }));
  expect(screen.getByText('Invoice 2026-10-003 sent')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'run.cancel' })).not.toBeInTheDocument();
  expect(screen.queryByTestId('task-card')).not.toBeInTheDocument();
});

it('says so when the run does not exist', () => {
  renderPage(undefined, { isError: true });
  expect(screen.getByText('run.notFound')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'run.back' })).toHaveAttribute('href', '/workflows?tab=runs');
});
