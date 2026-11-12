/**
 * The flows list (what a row tells and offers, creating a flow, the runs tab)
 * and the task page (open tasks by urgency, settled tasks on their own tab).
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import WorkflowsPage from '../../src/pages/workflows/WorkflowsPage';
import TasksPage from '../../src/pages/workflows/TasksPage';
import { toast } from '../../src/lib/toast';
import type { WorkflowRunSummary } from '../../src/api/types/workflow.types';
import { definition, run, task } from '../mocks/workflowFixtures';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (typeof options?.name === 'string' ? `${key}:${options.name}` : key),
    i18n: { language: 'en' },
  }),
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));
const mockConfirm = jest.fn();
jest.mock('../../src/lib/confirm', () => ({ confirmDialog: (...args: unknown[]) => mockConfirm(...args) }));
jest.mock('../../src/lib/toast', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../../src/components/workflows/tasks/TaskCard', () => ({
  TaskCard: ({ task: shown }: { task: { title: string } }) => <div data-testid="task-card">{shown.title}</div>,
}));
jest.mock('../../src/components/workflows/StartRunDialog', () => ({
  StartRunDialog: ({ definition: started }: { definition: { name: string } }) => <div role="dialog" aria-label={`start ${started.name}`} />,
}));

const mockDefinitions = jest.fn();
const mockRuns = jest.fn();
const mockTasks = jest.fn();
const mockSetStatus = jest.fn();
const mockDelete = jest.fn();
const mockCreate = jest.fn();
jest.mock('../../src/hooks/api/useWorkflows', () => ({
  useWorkflowDefinitions: () => mockDefinitions(),
  useWorkflowRuns: (filters: unknown, enabled: boolean) => mockRuns(filters, enabled),
  useWorkflowTasks: (status: string, runId: unknown, enabled?: boolean) => mockTasks(status, runId, enabled),
  useSetWorkflowStatus: () => ({ mutateAsync: mockSetStatus, isPending: false }),
  useDeleteWorkflow: () => ({ mutateAsync: mockDelete, isPending: false }),
  useCreateWorkflow: () => ({ mutateAsync: mockCreate, isPending: false }),
  useWorkflowTemplates: () => ({
    data: [{ key: 'timesheet-signature', name: 'Timesheet with signature', description: 'Signed timesheet, then invoice', subject_type: 'client', graph: { nodes: [], edges: [] } }],
  }),
}));

const loaded = <T,>(data: T) => ({ data, isLoading: false, isError: false });
const renderAt = (path: string, page = <WorkflowsPage />) => {
  render(<MemoryRouter initialEntries={[path]}>{page}</MemoryRouter>);
  return userEvent.setup();
};

beforeEach(() => {
  jest.clearAllMocks();
  mockConfirm.mockResolvedValue(true);
  mockSetStatus.mockResolvedValue({});
  mockDelete.mockResolvedValue(undefined);
  mockRuns.mockReturnValue(loaded<WorkflowRunSummary[]>([]));
  mockDefinitions.mockReturnValue(
    loaded([
      definition({ has_unpublished_changes: true, active_runs: 2, next_run_at: '2026-11-30T06:00:00Z' }),
      definition({ id: 'def-2', name: 'Onboarding', description: null, status: 'draft', published_version: null, active_runs: 0 }),
    ])
  );
});

describe('flows', () => {
  it('tells what each flow is and where it stands', () => {
    renderAt('/workflows');
    const row = screen.getByRole('row', { name: /Timesheet with signature/ });
    expect(within(row).getByRole('link', { name: 'Timesheet with signature' })).toHaveAttribute('href', '/workflows/def-1');
    expect(within(row).getByText('subjectTypes.client')).toBeInTheDocument();
    expect(within(row).getByText('definitionStatus.active')).toBeInTheDocument();
    expect(within(row).getByText('list.unpublished')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'list.showRuns:Timesheet with signature' })).toHaveTextContent('2');

    // a draft that was never published can't be started or paused
    const draft = screen.getByRole('row', { name: /Onboarding/ });
    expect(within(draft).queryByRole('button', { name: 'list.actions.start:Onboarding' })).not.toBeInTheDocument();
    expect(within(draft).queryByRole('button', { name: 'list.actions.pause:Onboarding' })).not.toBeInTheDocument();
    expect(within(draft).getByRole('button', { name: 'list.actions.delete:Onboarding' })).toBeInTheDocument();
  });

  it('pauses a flow and opens the start dialog', async () => {
    const user = renderAt('/workflows');
    await user.click(screen.getByRole('button', { name: 'list.actions.pause:Timesheet with signature' }));
    expect(mockSetStatus).toHaveBeenCalledWith({ id: 'def-1', status: 'paused' });

    await user.click(screen.getByRole('button', { name: 'list.actions.start:Timesheet with signature' }));
    expect(screen.getByRole('dialog', { name: 'start Timesheet with signature' })).toBeInTheDocument();
  });

  it('deletes after a confirmation and explains a refusal', async () => {
    const user = renderAt('/workflows');
    mockConfirm.mockResolvedValueOnce(false);
    await user.click(screen.getByRole('button', { name: 'list.actions.delete:Onboarding' }));
    expect(mockDelete).not.toHaveBeenCalled();

    mockDelete.mockRejectedValueOnce({ response: { status: 409, data: { message: 'Active runs.' } } });
    await user.click(screen.getByRole('button', { name: 'list.actions.delete:Timesheet with signature' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('list.deleteHasRuns', { description: undefined }));

    await user.click(screen.getByRole('button', { name: 'list.actions.delete:Onboarding' }));
    await waitFor(() => expect(mockDelete).toHaveBeenLastCalledWith('def-2'));
  });

  it('invites to create the first flow', () => {
    mockDefinitions.mockReturnValue(loaded([]));
    renderAt('/workflows');
    expect(screen.getByText('list.empty')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'list.new' }).length).toBeGreaterThan(0);
  });

  it('creates a flow from a template or from scratch and opens its editor', async () => {
    mockCreate.mockResolvedValue(definition({ id: 'def-9' }));
    const user = renderAt('/workflows');
    await user.click(screen.getByRole('button', { name: 'list.new' }));
    const dialog = await screen.findByRole('dialog', { name: 'create.title' });

    // from scratch a name is required
    await user.click(within(dialog).getByRole('button', { name: 'create.submit' }));
    expect(within(dialog).getByText('create.nameRequired')).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText('create.name'), 'Monthly billing');
    await user.selectOptions(within(dialog).getByLabelText('create.subjectType'), 'project');
    await user.click(within(dialog).getByRole('button', { name: 'create.submit' }));
    expect(mockCreate).toHaveBeenLastCalledWith({ name: 'Monthly billing', subject_type: 'project' });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/workflows/def-9'));
  });

  it('creates from a template with the template’s subject type', async () => {
    mockCreate.mockResolvedValue(definition({ id: 'def-10' }));
    const user = renderAt('/workflows');
    await user.click(screen.getByRole('button', { name: 'list.new' }));
    const dialog = await screen.findByRole('dialog', { name: 'create.title' });
    await user.click(within(dialog).getByRole('radio', { name: /templates\.timesheet-signature\.name/ }));
    expect(within(dialog).getByLabelText('create.subjectType')).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'create.submit' }));
    expect(mockCreate).toHaveBeenLastCalledWith({ template: 'timesheet-signature', name: undefined, lang: 'en' });
  });
});

describe('runs tab', () => {
  it('lists the runs of one flow and links each to its page', () => {
    const { graph: _graph, steps: _steps, tasks: _tasks, ...summary } = run();
    mockRuns.mockReturnValue(loaded([summary]));
    renderAt('/workflows?tab=runs&definition=def-1');
    expect(mockRuns).toHaveBeenLastCalledWith({ definition_id: 'def-1', status: undefined, limit: 100 }, true);
    expect(screen.getByRole('link', { name: 'ACME GmbH' })).toHaveAttribute('href', '/workflows/runs/run-1');
    const row = screen.getByRole('row', { name: /ACME GmbH/ });
    expect(within(row).getByText('runStatus.waiting')).toBeInTheDocument();
    expect(within(row).getByText('Upload the signed timesheet')).toBeInTheDocument();
  });

  it('filters by status', async () => {
    const user = renderAt('/workflows?tab=runs');
    await user.selectOptions(screen.getByLabelText('runs.filters.status'), 'incident');
    expect(mockRuns).toHaveBeenLastCalledWith({ definition_id: undefined, status: 'incident', limit: 100 }, true);
    expect(screen.getByText('runs.empty')).toBeInTheDocument();
  });
});

describe('tasks page', () => {
  it('lists open tasks by urgency and loads settled ones only when asked', async () => {
    mockTasks.mockImplementation((status: string) =>
      status === 'open'
        ? loaded([
            task({ id: 't1', title: 'Without due date' }),
            task({ id: 't2', title: 'Due soon', due_at: '2026-11-14T00:00:00Z' }),
          ])
        : loaded([task({ id: 't3', title: 'Settled', status: 'done', completed_at: '2026-11-10T00:00:00Z' })])
    );
    const user = renderAt('/tasks', <TasksPage />);
    expect(screen.getAllByTestId('task-card').map((card) => card.textContent)).toEqual(['Due soon', 'Without due date']);
    expect(mockTasks).toHaveBeenCalledWith('closed', undefined, false);

    await user.click(screen.getByRole('tab', { name: /tasks\.tabs\.closed/ }));
    expect(mockTasks).toHaveBeenLastCalledWith('closed', undefined, true);
    expect(screen.getAllByTestId('task-card').map((card) => card.textContent)).toEqual(['Settled']);
  });

  it('says so when there is nothing to do', () => {
    mockTasks.mockReturnValue(loaded([]));
    renderAt('/tasks', <TasksPage />);
    expect(screen.getByText('tasks.emptyOpen')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'tasks.toFlows' })).toHaveAttribute('href', '/workflows');
  });
});
