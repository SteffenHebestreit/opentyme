/**
 * The create/edit dialog for API tokens: permission levels per resource,
 * features, the approval choice, and what gets sent to the API.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiTokenFormModal } from '../../src/components/admin/api-tokens/ApiTokenFormModal';
import type { ApiToken, ApiTokenCatalog } from '../../src/api/types';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key),
    i18n: { language: 'en' },
  }),
}));

const catalog: ApiTokenCatalog = {
  levels: ['none', 'read', 'write', 'delete'],
  resources: [
    { key: 'clients', levels: ['none', 'read', 'write', 'delete'] },
    { key: 'invoices', levels: ['none', 'read', 'write', 'delete'] },
    { key: 'reports', levels: ['none', 'read'] },
  ],
  capabilities: [{ key: 'assistant' }, { key: 'mcp' }, { key: 'email_send' }],
  approvalModes: ['self', 'in_app'],
};

const mockCreate = jest.fn();
const mockUpdate = jest.fn();
jest.mock('../../src/hooks/api/useApiTokens', () => ({
  useApiTokenCatalog: () => ({ data: catalog, isLoading: false, error: null }),
  useCreateApiToken: () => ({ mutateAsync: mockCreate, isPending: false }),
  useUpdateApiToken: () => ({ mutateAsync: mockUpdate, isPending: false }),
}));

const L = 'admin.apiTokens';

function renderForm(token: ApiToken | null = null) {
  const onCreated = jest.fn();
  const onSaved = jest.fn();
  render(<ApiTokenFormModal token={token} open onClose={jest.fn()} onCreated={onCreated} onSaved={onSaved} />);
  return { onCreated, onSaved, user: userEvent.setup() };
}

const group = (resource: string) => screen.getByRole('radiogroup', { name: `${L}.resources.${resource}.label` });
const submit = (user: ReturnType<typeof userEvent.setup>, label = `${L}.form.create`) =>
  user.click(screen.getByRole('button', { name: label }));

beforeEach(() => {
  mockCreate.mockReset();
  mockUpdate.mockReset();
});

it('offers each resource only the levels it supports, starting at none', () => {
  renderForm();
  const clients = within(group('clients')).getAllByRole('radio');
  expect(clients.map((r) => (r as HTMLInputElement).value)).toEqual(['none', 'read', 'write', 'delete']);
  expect(within(group('clients')).getByRole('radio', { name: `${L}.levels.none` })).toBeChecked();
  expect(within(group('reports')).getAllByRole('radio')).toHaveLength(2);
});

it('refuses to create a token that grants nothing', async () => {
  const { user } = renderForm();
  await user.type(screen.getByLabelText(new RegExp(`${L}.form.nameLabel`)), 'Empty');
  await submit(user);
  expect(await screen.findByText(`${L}.form.nothingGranted`)).toBeInTheDocument();
  expect(mockCreate).not.toHaveBeenCalled();
});

it('requires a name', async () => {
  const { user } = renderForm();
  await user.click(within(group('clients')).getByRole('radio', { name: `${L}.levels.read` }));
  await submit(user);
  expect(await screen.findByText(`${L}.form.nameRequired`)).toBeInTheDocument();
  expect(mockCreate).not.toHaveBeenCalled();
});

it('sends exactly the chosen permissions, a 30-day expiry and hands back the secret', async () => {
  const result = { token: { id: 't1', name: 'Agent' }, secret: 'oty_pat_x' };
  mockCreate.mockResolvedValue(result);
  const { user, onCreated } = renderForm();

  await user.type(screen.getByLabelText(new RegExp(`${L}.form.nameLabel`)), '  Agent  ');
  await user.click(within(group('clients')).getByRole('radio', { name: `${L}.levels.write` }));
  await user.click(within(group('reports')).getByRole('radio', { name: `${L}.levels.read` }));
  await user.click(screen.getByRole('switch', { name: `${L}.capabilities.mcp.label` }));
  const before = Date.now();
  await submit(user);

  await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
  const payload = mockCreate.mock.calls[0][0];
  expect(payload).toMatchObject({
    name: 'Agent',
    description: null,
    permissions: { resources: { clients: 'write', reports: 'read' }, capabilities: ['mcp'] },
    approval_mode: 'self',
  });
  const days = (new Date(payload.expires_at).getTime() - before) / (24 * 3600 * 1000);
  expect(days).toBeGreaterThan(29.9);
  expect(days).toBeLessThan(30.1);
  expect(onCreated).toHaveBeenCalledWith(result);
});

it('asks who approves the assistant’s changes only once the assistant is enabled', async () => {
  mockCreate.mockResolvedValue({ token: {}, secret: 's' });
  const { user } = renderForm();
  expect(screen.queryByRole('radiogroup', { name: `${L}.approval.title` })).not.toBeInTheDocument();

  await user.click(screen.getByRole('switch', { name: `${L}.capabilities.assistant.label` }));
  const approval = screen.getByRole('radiogroup', { name: `${L}.approval.title` });
  expect(within(approval).getByRole('radio', { name: new RegExp(`${L}.approval.self.label`) })).toBeChecked();
  await user.click(within(approval).getByRole('radio', { name: new RegExp(`${L}.approval.in_app.label`) }));

  await user.type(screen.getByLabelText(new RegExp(`${L}.form.nameLabel`)), 'Chat agent');
  await submit(user);
  await waitFor(() => expect(mockCreate).toHaveBeenCalled());
  expect(mockCreate.mock.calls[0][0]).toMatchObject({
    permissions: { resources: {}, capabilities: ['assistant'] },
    approval_mode: 'in_app',
  });
});

it('presets set every resource, capped at its highest level', async () => {
  const { user } = renderForm();
  await user.click(screen.getByRole('button', { name: `${L}.form.presets.full` }));
  expect(within(group('clients')).getByRole('radio', { name: `${L}.levels.delete` })).toBeChecked();
  expect(within(group('reports')).getByRole('radio', { name: `${L}.levels.read` })).toBeChecked();

  await user.click(screen.getByRole('button', { name: `${L}.form.presets.clear` }));
  expect(within(group('clients')).getByRole('radio', { name: `${L}.levels.none` })).toBeChecked();
});

it('shows a name clash from the server on the name field', async () => {
  mockCreate.mockRejectedValue({ response: { data: { code: 'NAME_TAKEN', message: 'taken' } } });
  const { user } = renderForm();
  await user.type(screen.getByLabelText(new RegExp(`${L}.form.nameLabel`)), 'Dup');
  await user.click(within(group('clients')).getByRole('radio', { name: `${L}.levels.read` }));
  await submit(user);
  expect(await screen.findByText(`${L}.form.nameTaken`)).toBeInTheDocument();
});

it('edits a token without touching its expiry', async () => {
  mockUpdate.mockResolvedValue({});
  const token: ApiToken = {
    id: 'tok-1',
    name: 'Script',
    description: null,
    token_prefix: 'oty_pat_AbCd',
    permissions: { resources: { invoices: 'read' }, capabilities: [] },
    approval_mode: 'self',
    expires_at: null,
    last_used_at: null,
    last_used_ip: null,
    last_used_user_agent: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  };
  const { user, onSaved } = renderForm(token);

  expect(within(group('invoices')).getByRole('radio', { name: `${L}.levels.read` })).toBeChecked();
  expect(screen.queryByText(`${L}.form.expiryLabel`)).not.toBeInTheDocument();
  expect(screen.getByText(new RegExp(`${L}.form.expiryFixed`))).toBeInTheDocument();

  await user.click(within(group('invoices')).getByRole('radio', { name: `${L}.levels.delete` }));
  await submit(user, `${L}.form.save`);

  await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
  const { id, data } = mockUpdate.mock.calls[0][0];
  expect(id).toBe('tok-1');
  expect(data).not.toHaveProperty('expires_at');
  expect(data.permissions).toEqual({ resources: { invoices: 'delete' }, capabilities: [] });
  expect(onSaved).toHaveBeenCalled();
});
