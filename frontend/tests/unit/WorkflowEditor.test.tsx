/**
 * The canvas editor: a flow's blocks appear on the canvas, a block added from
 * the palette can be configured and saved, validation issues lead to the
 * block they are about, and publishing saves, checks and shows what the flow's
 * runs will be allowed to do.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { WorkflowEditor } from '../../src/components/workflows/editor/WorkflowEditor';
import type { WorkflowGraph, WorkflowValidation } from '../../src/api/types/workflow.types';
import { definition } from '../mocks/workflowFixtures';
import { mockReactFlowDom } from '../mocks/reactFlowDom';

mockReactFlowDom();

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
jest.mock('../../src/store/AppContext', () => ({ useApp: () => ({ state: { theme: 'light' } }) }));
jest.mock('../../src/lib/toast', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../../src/lib/confirm', () => ({ confirmDialog: jest.fn().mockResolvedValue(true) }));
jest.mock('../../src/hooks/api/useClients', () => ({ useClients: () => ({ data: [{ id: 'c1', name: 'ACME GmbH' }] }) }));
jest.mock('../../src/hooks/api/useProjects', () => ({ useProjects: () => ({ data: [] }) }));
jest.mock('../../src/hooks/api/useInvoices', () => ({ useInvoices: () => ({ data: [] }) }));
jest.mock('../../src/api/hooks/useEmailTemplates', () => ({
  useEmailTemplates: () => ({ data: [{ id: 'tpl-1', name: 'Timesheet mail' }] }),
}));

const mockUpdate = jest.fn();
const mockValidate = jest.fn();
const mockPublish = jest.fn();
jest.mock('../../src/hooks/api/useWorkflows', () => ({
  useWorkflowCatalog: () => ({ data: jest.requireActual('../mocks/workflowFixtures').catalog }),
  useUpdateWorkflow: () => ({ mutateAsync: mockUpdate, isPending: false }),
  useValidateWorkflow: () => ({ mutateAsync: mockValidate, isPending: false }),
  usePublishWorkflow: () => ({ mutateAsync: mockPublish, isPending: false }),
  useStartWorkflowRun: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useWorkflowSubjectOptions: () => ({ data: [] }),
}));

const valid: WorkflowValidation = {
  valid: true,
  issues: [],
  permissions: { resources: { reports: 'read', clients: 'write' }, capabilities: ['email_send'] },
};

function renderEditor() {
  const router = createMemoryRouter(
    [
      { path: '/workflows/:id', element: <WorkflowEditor definition={definition({ has_unpublished_changes: true })} /> },
      { path: '/workflows', element: <div>the list</div> },
    ],
    { initialEntries: ['/workflows/def-1'] }
  );
  return { router, user: userEvent.setup(), ...render(<RouterProvider router={router} />) };
}

beforeEach(() => {
  mockUpdate.mockReset().mockImplementation(async ({ data }) => definition({ name: data.name, graph: data.graph }));
  mockValidate.mockReset().mockResolvedValue(valid);
  mockPublish.mockReset().mockResolvedValue(definition({ published_version: 3 }));
});

it('shows the flow: its name and status, the palette and the blocks on the canvas', () => {
  renderEditor();
  expect(screen.getByRole('heading', { level: 1, name: 'Timesheet with signature' })).toBeInTheDocument();
  expect(screen.getByText('definitionStatus.active')).toBeInTheDocument();
  expect(screen.getByText('editor.unpublished')).toBeInTheDocument();

  const palette = screen.getByRole('navigation', { name: 'palette.title' });
  expect(within(palette).getByRole('button', { name: 'nodeTypes.start' })).toBeDisabled(); // the flow already has its start
  expect(within(palette).getByRole('button', { name: 'actions.email.send.title' })).toBeEnabled();
  expect(within(palette).getByRole('button', { name: 'taskKinds.upload' })).toBeEnabled();

  // node cards: own labels, else names derived from what the block does
  expect(screen.getByText('Timesheet to client')).toBeInTheDocument();
  expect(screen.getByText('Upload the signed timesheet')).toBeInTheDocument();
  expect(screen.getAllByText('actions.timesheet.generate.title')).toHaveLength(2); // in the palette and as a block
  expect(screen.getByText('Hours logged?')).toBeInTheDocument();

  // nothing selected → the flow's own settings; nothing changed → nothing to save
  expect(screen.getByLabelText('panel.name')).toHaveValue('Timesheet with signature');
  expect(screen.getByRole('button', { name: 'editor.save' })).toBeDisabled();
});

it('adds a block from the palette, configures it and saves the draft', async () => {
  const { user } = renderEditor();
  await user.click(screen.getByRole('button', { name: 'actions.email.send.title' }));

  // the new block is selected: its settings come from the catalog
  const panel = screen.getByRole('complementary', { name: 'panel.title' });
  expect(within(panel).getByText('n10')).toBeInTheDocument();
  expect(within(panel).getByRole('radio', { name: 'mode.approval' })).toBeChecked(); // mail asks first by default
  expect(within(panel).getByLabelText(/actions\.email\.send\.fields\.to/)).toHaveValue('client.invoice_email'); // pre-filled reference

  await user.selectOptions(within(panel).getByLabelText(/actions\.email\.send\.fields\.templateId/), 'tpl-1');
  await user.click(within(panel).getByRole('radio', { name: 'mode.auto' }));

  expect(screen.getByText('editor.unsaved')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'editor.save' }));

  expect(mockUpdate).toHaveBeenCalledTimes(1);
  const saved = mockUpdate.mock.calls[0][0] as { id: string; data: { name: string; graph: WorkflowGraph } };
  expect(saved.id).toBe('def-1');
  expect(saved.data.graph.nodes).toHaveLength(10);
  expect(saved.data.graph.nodes[9]).toMatchObject({
    id: 'n10',
    type: 'action',
    data: { action: 'email.send', mode: 'auto', input: { to: { $ref: 'client.invoice_email' }, templateId: 'tpl-1' } },
  });
  expect(saved.data.graph.edges).toHaveLength(9);
  await waitFor(() => expect(screen.queryByText('editor.unsaved')).not.toBeInTheDocument());
});

it('lists validation issues and leads to the block and field they are about', async () => {
  mockValidate.mockResolvedValue({
    ...valid,
    valid: false,
    issues: [
      { code: 'MISSING_INPUT', message: 'A required value is missing.', nodeId: 'n5', field: 'templateId' },
      { code: 'NO_END', message: 'The flow has no end.' },
    ],
  });
  const { user } = renderEditor();
  await user.click(screen.getByRole('button', { name: 'editor.validate' }));

  const issues = await screen.findByRole('region', { name: 'editor.issuesTitle' });
  expect(within(issues).getByText('issues.NO_END')).toBeInTheDocument();
  await user.click(within(issues).getByRole('button', { name: 'Timesheet to client: issues.MISSING_INPUT' }));

  const panel = screen.getByRole('complementary', { name: 'panel.title' });
  expect(within(panel).getByText('n5')).toBeInTheDocument();
  expect(within(panel).getByLabelText('panel.label')).toHaveValue('Timesheet to client');
  // the message sits at the field it is about
  expect(within(panel).getByText('issues.MISSING_INPUT')).toBeInTheDocument();
  // the validated graph is the one on the canvas
  expect((mockValidate.mock.calls[0][0] as { graph: WorkflowGraph }).graph.nodes).toHaveLength(9);
});

it('publishes: checks the draft, shows what runs may do, then creates the next version', async () => {
  const { user } = renderEditor();
  await user.click(screen.getByRole('button', { name: 'editor.publish' }));

  const dialog = await screen.findByRole('dialog', { name: 'publish.title' });
  expect(mockUpdate).not.toHaveBeenCalled(); // nothing unsaved
  expect(mockValidate).toHaveBeenCalledTimes(1);
  expect(within(dialog).getByText('settings:admin.apiTokens.capabilities.email_send.label')).toBeInTheDocument();
  expect(within(dialog).getByText(/settings:admin\.apiTokens\.resources\.clients\.label/)).toBeInTheDocument();

  await user.click(within(dialog).getByRole('button', { name: 'publish.confirm' }));
  expect(mockPublish).toHaveBeenCalledWith('def-1');
});

it('does not publish an invalid draft', async () => {
  mockValidate.mockResolvedValue({ ...valid, valid: false, issues: [{ code: 'NO_END', message: 'The flow has no end.' }] });
  const { user } = renderEditor();
  await user.click(screen.getByRole('button', { name: 'editor.publish' }));
  expect(await screen.findByRole('region', { name: 'editor.issuesTitle' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: 'publish.title' })).not.toBeInTheDocument();
  expect(mockPublish).not.toHaveBeenCalled();
});
