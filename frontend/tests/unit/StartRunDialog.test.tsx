/**
 * Starting a run: subject and period are asked for, a test run is one
 * checkbox away, the new run opens — and a duplicate start points at the run
 * that already exists. Plus the "Start flow" button for one client.
 * (What an addon's subject looks like here: workflowAddonSubject.test.tsx.)
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { StartRunDialog } from '../../src/components/workflows/StartRunDialog';
import { StartWorkflowButton } from '../../src/components/workflows/StartWorkflowButton';
import { currentMonth } from '../../src/components/workflows/graph/period';
import type { WorkflowDefinitionSummary } from '../../src/api/types/workflow.types';
import { ADDON_SUBJECT, addonCatalog, definition } from '../mocks/workflowFixtures';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../../src/components/workflows/EntityOptions', () => ({
  ClientOptions: () => <option value="client-1">ACME GmbH</option>,
  ProjectOptions: () => <option value="project-1">Website</option>,
  InvoiceOptions: () => <option value="invoice-1">2026-10-003</option>,
  SubjectOptions: ({ type }: { type: string }) => <option value="record-1">{`a record of ${type}`}</option>,
}));

const mockStart = jest.fn();
const mockDefinitions = jest.fn();
const mockCatalog = jest.fn();
jest.mock('../../src/hooks/api/useWorkflows', () => ({
  useStartWorkflowRun: () => ({ mutateAsync: mockStart, isPending: false }),
  useWorkflowDefinitions: () => mockDefinitions(),
  useWorkflowCatalog: () => ({ data: mockCatalog() }),
}));

const month = currentMonth();

function renderDialog(overrides: Partial<WorkflowDefinitionSummary> = {}, subjectId?: string) {
  const onClose = jest.fn();
  render(
    <MemoryRouter>
      <StartRunDialog definition={definition(overrides)} open onClose={onClose} subjectId={subjectId} />
    </MemoryRouter>
  );
  return { onClose, user: userEvent.setup() };
}

beforeEach(() => {
  mockNavigate.mockReset();
  mockStart.mockReset().mockResolvedValue({ id: 'run-7' });
  mockDefinitions.mockReset();
  mockCatalog.mockReset().mockReturnValue(addonCatalog());
});

it('starts a run for the chosen client and the current month, then opens it', async () => {
  const { user, onClose } = renderDialog();
  await user.selectOptions(screen.getByLabelText('start.dialog.subject.client'), 'client-1');
  expect(screen.getByLabelText('start.dialog.periodStart')).toHaveValue(month.start);
  await user.click(screen.getByRole('button', { name: 'start.dialog.submit' }));

  expect(mockStart).toHaveBeenCalledWith({
    definitionId: 'def-1',
    request: { test: false, subject_id: 'client-1', period_start: month.start, period_end: month.end },
  });
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/workflows/runs/run-7'));
  expect(onClose).toHaveBeenCalled();
});

it('asks for the subject before starting', async () => {
  const { user } = renderDialog();
  await user.click(screen.getByRole('button', { name: 'start.dialog.submit' }));
  expect(screen.getByText('start.dialog.subjectRequired.client')).toBeInTheDocument();
  expect(mockStart).not.toHaveBeenCalled();
});

it('starts a test run when asked to', async () => {
  const { user } = renderDialog();
  await user.selectOptions(screen.getByLabelText('start.dialog.subject.client'), 'client-1');
  await user.click(screen.getByRole('checkbox', { name: /testRun\.checkbox/ }));
  await user.click(screen.getByRole('button', { name: 'start.dialog.submitTest' }));
  expect(mockStart.mock.calls[0][0].request).toMatchObject({ test: true, subject_id: 'client-1' });
});

it('points to the existing run when the flow already ran for that subject and period', async () => {
  mockStart.mockRejectedValue({ response: { status: 409, data: { code: 'RUN_EXISTS', run_id: 'run-3', message: 'A run exists.' } } });
  const { user } = renderDialog();
  await user.selectOptions(screen.getByLabelText('start.dialog.subject.client'), 'client-1');
  await user.click(screen.getByRole('button', { name: 'start.dialog.submit' }));

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('start.dialog.runExists');
  expect(screen.getByRole('link', { name: 'start.dialog.openExisting' })).toHaveAttribute('href', '/workflows/runs/run-3');
  expect(mockNavigate).not.toHaveBeenCalled();
});

it('shows the server’s reason for any other failure', async () => {
  mockStart.mockRejectedValue({ response: { status: 400, data: { message: 'The client has no email address.' } } });
  const { user } = renderDialog();
  await user.selectOptions(screen.getByLabelText('start.dialog.subject.client'), 'client-1');
  await user.click(screen.getByRole('button', { name: 'start.dialog.submit' }));
  expect(await screen.findByText('The client has no email address.')).toBeInTheDocument();
});

it('cannot start a flow that was never published', () => {
  renderDialog({ published_version: null });
  expect(screen.getByText('start.dialog.notPublished')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'start.dialog.submit' })).toBeDisabled();
});

it('needs no subject for a flow without one and no period for an invoice', async () => {
  const { user } = renderDialog({ subject_type: 'none' });
  expect(screen.queryByLabelText(/start\.dialog\.subject\./)).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'start.dialog.submit' }));
  expect(mockStart.mock.calls[0][0].request).toEqual({ test: false, period_start: month.start, period_end: month.end });
});

it('asks for a period only where a flow can recur — not for one invoice', async () => {
  const { user } = renderDialog({ subject_type: 'invoice' });
  expect(screen.queryByLabelText('start.dialog.periodStart')).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText('start.dialog.subject.invoice'), 'invoice-1');
  await user.click(screen.getByRole('button', { name: 'start.dialog.submit' }));
  expect(mockStart.mock.calls[0][0].request).toEqual({ test: false, subject_id: 'invoice-1' });
});

it('keeps the period for clients and projects while the catalog is still loading', () => {
  mockCatalog.mockReturnValue(undefined);
  renderDialog({ subject_type: 'project' });
  expect(screen.getByLabelText('start.dialog.periodStart')).toHaveValue(month.start);
});

it('lists the records of a subject an addon brought along, as the workflow API knows them', async () => {
  const { user } = renderDialog({ subject_type: ADDON_SUBJECT });
  // not schedulable: one application has no period
  expect(screen.queryByLabelText('start.dialog.periodStart')).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText(`start.dialog.subject.${ADDON_SUBJECT}`), 'record-1');
  expect(screen.getByRole('option', { name: `a record of ${ADDON_SUBJECT}` })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'start.dialog.submit' }));
  expect(mockStart.mock.calls[0][0].request).toEqual({ test: false, subject_id: 'record-1' });
});

describe('StartWorkflowButton', () => {
  const renderButton = () =>
    render(
      <MemoryRouter>
        <StartWorkflowButton subjectType="client" subjectId="client-9" />
      </MemoryRouter>
    );

  it('renders nothing while no active, published flow fits the subject', () => {
    mockDefinitions.mockReturnValue({
      data: [definition({ status: 'paused' }), definition({ id: 'def-2', published_version: null }), definition({ id: 'def-3', subject_type: 'project' })],
    });
    const { container } = renderButton();
    expect(container).toBeEmptyDOMElement();
  });

  it('starts the one fitting flow for this subject without asking for it again', async () => {
    mockDefinitions.mockReturnValue({ data: [definition()] });
    renderButton();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'start.button' }));
    expect(screen.queryByLabelText('start.dialog.subject.client')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'start.dialog.submit' }));
    expect(mockStart.mock.calls[0][0]).toMatchObject({ definitionId: 'def-1', request: { subject_id: 'client-9' } });
  });

  it('is not a click on the table row it sits in — neither the button nor its dialog', async () => {
    mockDefinitions.mockReturnValue({ data: [definition({ subject_type: 'invoice' })] });
    const onRowClick = jest.fn();
    render(
      <MemoryRouter>
        <table>
          <tbody>
            <tr onClick={onRowClick}>
              <td>
                <StartWorkflowButton subjectType="invoice" subjectId="invoice-9" compact />
              </td>
            </tr>
          </tbody>
        </table>
      </MemoryRouter>
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'start.button' }));
    // the dialog is a portal, but React lets its clicks bubble to the row
    await user.click(screen.getByRole('checkbox', { name: /testRun\.checkbox/ }));
    await user.click(screen.getByRole('button', { name: 'start.dialog.submitTest' }));
    expect(mockStart.mock.calls[0][0]).toMatchObject({ definitionId: 'def-1', request: { test: true, subject_id: 'invoice-9' } });
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('lets the user choose when several flows fit — as an icon button in a table row', async () => {
    mockDefinitions.mockReturnValue({ data: [definition(), definition({ id: 'def-2', name: 'Onboarding', description: 'Welcome mail and contract' })] });
    render(
      <MemoryRouter>
        <StartWorkflowButton subjectType="client" subjectId="client-9" subjectName="ACME GmbH" compact />
      </MemoryRouter>
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'start.buttonFor' }));
    const chooser = await screen.findByRole('dialog', { name: 'start.chooseFlow' });
    await user.click(within(chooser).getByRole('button', { name: /Onboarding/ }));
    await user.click(await screen.findByRole('button', { name: 'start.dialog.submit' }));
    expect(mockStart.mock.calls[0][0]).toMatchObject({ definitionId: 'def-2', request: { subject_id: 'client-9' } });
  });
});
