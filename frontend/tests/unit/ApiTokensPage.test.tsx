/**
 * The API tokens settings page: what a token row tells the user, the empty
 * state, and revoking.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ApiTokensPage from '../../src/pages/admin/ApiTokensPage';
import type { ApiToken, ApiTokenCatalog } from '../../src/api/types';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key),
    i18n: { language: 'en' },
  }),
}));

const mockConfirm = jest.fn();
jest.mock('../../src/lib/confirm', () => ({ confirmDialog: (...args: unknown[]) => mockConfirm(...args) }));
jest.mock('../../src/lib/toast', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const catalog: ApiTokenCatalog = {
  levels: ['none', 'read', 'write', 'delete'],
  resources: (['clients', 'projects', 'time_entries', 'invoices', 'payments', 'reports'] as const).map((key) => ({
    key,
    levels: key === 'reports' ? ['none', 'read'] : ['none', 'read', 'write', 'delete'],
  })),
  capabilities: [{ key: 'assistant' }, { key: 'mcp' }, { key: 'email_send' }],
  approvalModes: ['self', 'in_app'],
};

const mockRevoke = jest.fn();
const mockTokens = jest.fn();
jest.mock('../../src/hooks/api/useApiTokens', () => ({
  useApiTokens: () => mockTokens(),
  useApiTokenCatalog: () => ({ data: catalog, isLoading: false, error: null }),
  useRevokeApiToken: () => ({ mutateAsync: mockRevoke }),
  useCreateApiToken: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdateApiToken: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useRegenerateApiToken: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useApiTokenEvents: () => ({ data: [] }),
}));

const L = 'admin.apiTokens';
const DAY = 24 * 60 * 60 * 1000;

function token(overrides: Partial<ApiToken>): ApiToken {
  return {
    id: 'tok-1',
    name: 'Claude Code',
    description: null,
    token_prefix: 'oty_pat_AbCd',
    permissions: { resources: {}, capabilities: [] },
    approval_mode: 'self',
    expires_at: null,
    last_used_at: null,
    last_used_ip: null,
    last_used_user_agent: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  mockRevoke.mockReset();
  mockConfirm.mockReset();
});

it('invites creating the first token when there are none', async () => {
  mockTokens.mockReturnValue({ data: [], isLoading: false, error: null });
  render(<ApiTokensPage />);
  expect(screen.getByText(`${L}.empty.title`)).toBeInTheDocument();

  const user = userEvent.setup();
  await user.click(screen.getAllByRole('button', { name: `${L}.newButton` })[0]);
  expect(await screen.findByRole('dialog', { name: `${L}.form.createTitle` })).toBeInTheDocument();
});

it('summarises what each token can do and when it expires', () => {
  mockTokens.mockReturnValue({
    data: [
      token({
        id: 'a',
        name: 'Agent',
        description: 'runs nightly',
        permissions: {
          resources: { clients: 'read', projects: 'read', time_entries: 'write', invoices: 'delete', payments: 'read' },
          capabilities: ['mcp'],
        },
        expires_at: new Date(Date.now() + 3 * DAY - 60_000).toISOString(),
        last_used_at: new Date(Date.now() - 3600_000).toISOString(),
      }),
      token({ id: 'b', name: 'Forever', permissions: { resources: { reports: 'read' }, capabilities: [] } }),
      token({
        id: 'c',
        name: 'Old',
        permissions: { resources: { clients: 'read' }, capabilities: [] },
        expires_at: new Date(Date.now() - DAY).toISOString(),
      }),
    ],
    isLoading: false,
    error: null,
  });
  render(<ApiTokensPage />);

  const agentRow = screen.getByText('Agent').closest('tr')!;
  expect(within(agentRow).getByText('runs nightly')).toBeInTheDocument();
  expect(within(agentRow).getByText('oty_pat_AbCd…')).toBeInTheDocument();
  expect(within(agentRow).getByText(`${L}.capabilities.mcp.label`)).toBeInTheDocument();
  // Three resources shown, the other two folded into "+2 more".
  expect(within(agentRow).getByText(`${L}.resources.clients.label · ${L}.levels.read`)).toBeInTheDocument();
  expect(within(agentRow).getByText(`${L}.moreAccess {"count":2}`)).toBeInTheDocument();
  expect(within(agentRow).getByText(`${L}.expiry.inDays {"count":3}`)).toBeInTheDocument();
  expect(within(agentRow).queryByText(`${L}.neverUsed`)).not.toBeInTheDocument();

  const foreverRow = screen.getByText('Forever').closest('tr')!;
  expect(within(foreverRow).getByText(`${L}.expiry.never`)).toBeInTheDocument();
  expect(within(foreverRow).getByText(`${L}.neverUsed`)).toBeInTheDocument();

  const oldRow = screen.getByText('Old').closest('tr')!;
  expect(within(oldRow).getByText(`${L}.expiry.expired`)).toBeInTheDocument();
});

it('revokes a token only after confirmation', async () => {
  mockTokens.mockReturnValue({
    data: [token({ id: 'tok-9', name: 'Leaky', permissions: { resources: { clients: 'read' }, capabilities: [] } })],
    isLoading: false,
    error: null,
  });
  render(<ApiTokensPage />);
  const user = userEvent.setup();
  const revoke = screen.getByRole('button', { name: `${L}.actions.revoke: Leaky` });

  mockConfirm.mockResolvedValueOnce(false);
  await user.click(revoke);
  expect(mockRevoke).not.toHaveBeenCalled();

  mockConfirm.mockResolvedValueOnce(true);
  mockRevoke.mockResolvedValueOnce(undefined);
  await user.click(revoke);
  await waitFor(() => expect(mockRevoke).toHaveBeenCalledWith('tok-9'));
  expect(mockConfirm).toHaveBeenLastCalledWith(
    expect.objectContaining({ tone: 'danger', message: `${L}.revoke.message {"name":"Leaky"}` })
  );
});
