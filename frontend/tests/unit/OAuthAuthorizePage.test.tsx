/**
 * OAuth consent: shows who asks and where the user goes back, grants
 * exactly what was chosen (MCP always on), and sends the user back.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import OAuthAuthorizePage from '../../src/pages/oauth/OAuthAuthorizePage';
import type { ApiTokenCatalog } from '../../src/api/types';

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
    { key: 'reports', levels: ['none', 'read'] },
  ],
  capabilities: [{ key: 'assistant' }, { key: 'mcp' }, { key: 'email_send' }],
  approvalModes: ['self', 'in_app'],
};
jest.mock('../../src/hooks/api/useApiTokens', () => ({ useApiTokenCatalog: () => ({ data: catalog, isLoading: false, error: null }) }));

const mockDescribe = jest.fn();
const mockApprove = jest.fn();
const mockDeny = jest.fn();
jest.mock('../../src/api/services/oauth.service', () => ({
  describeAuthorization: (...a: unknown[]) => mockDescribe(...a),
  approveAuthorization: (...a: unknown[]) => mockApprove(...a),
  denyAuthorization: (...a: unknown[]) => mockDeny(...a),
}));

const assign = jest.fn();
jest.mock('../../src/lib/navigate', () => ({ leaveTo: (url: string) => assign(url) }));

const QUERY = '?response_type=code&client_id=c1&redirect_uri=https%3A%2F%2Fclaude.ai%2Fcb&code_challenge=abc&code_challenge_method=S256&state=s1';

function renderPage() {
  render(
    <MemoryRouter initialEntries={[`/oauth/authorize${QUERY}`]}>
      <OAuthAuthorizePage />
    </MemoryRouter>
  );
  return userEvent.setup();
}

beforeEach(() => {
  assign.mockReset();
  mockApprove.mockReset();
  mockDeny.mockReset();
  mockDescribe.mockReset().mockResolvedValue({ client: { id: 'c1', name: 'Claude', redirectHost: 'claude.ai' } });
});

it('names the app and where the user will be sent', async () => {
  renderPage();
  expect(await screen.findByText('oauth.title {"client":"Claude"}')).toBeInTheDocument();
  expect(screen.getByText('oauth.verify {"client":"Claude","host":"claude.ai"}')).toBeInTheDocument();
  expect(mockDescribe).toHaveBeenCalledWith(expect.objectContaining({ client_id: 'c1', state: 's1', code_challenge: 'abc' }));
});

it('starts read-only with MCP locked on, and grants exactly what was chosen', async () => {
  mockApprove.mockResolvedValue('https://claude.ai/cb?code=xyz&state=s1');
  const user = renderPage();
  await screen.findByText('oauth.title {"client":"Claude"}');

  const mcp = screen.getByRole('switch', { name: 'admin.apiTokens.capabilities.mcp.label' });
  expect(mcp).toBeChecked();
  expect(mcp).toBeDisabled();
  const clients = screen.getByRole('radiogroup', { name: 'admin.apiTokens.resources.clients.label' });
  expect(within(clients).getByRole('radio', { name: 'admin.apiTokens.levels.read' })).toBeChecked();
  await user.click(within(clients).getByRole('radio', { name: 'admin.apiTokens.levels.write' }));

  await user.click(screen.getByRole('button', { name: 'oauth.allow' }));
  await waitFor(() => expect(assign).toHaveBeenCalledWith('https://claude.ai/cb?code=xyz&state=s1'));
  const [request, grant] = mockApprove.mock.calls[0];
  expect(request).toMatchObject({ client_id: 'c1', redirect_uri: 'https://claude.ai/cb' });
  expect(grant).toMatchObject({
    permissions: { resources: { clients: 'write', reports: 'read' }, capabilities: ['mcp'] },
    approval_mode: 'self',
  });
});

it('sends a denial back to the app', async () => {
  mockDeny.mockResolvedValue('https://claude.ai/cb?error=access_denied&state=s1');
  const user = renderPage();
  await screen.findByText('oauth.title {"client":"Claude"}');
  await user.click(screen.getByRole('button', { name: 'oauth.deny' }));
  await waitFor(() => expect(assign).toHaveBeenCalledWith('https://claude.ai/cb?error=access_denied&state=s1'));
  expect(mockApprove).not.toHaveBeenCalled();
});

it('shows why a request is refused, and never redirects to an unregistered URI', async () => {
  mockDescribe.mockRejectedValue({ response: { data: { error: 'invalid_request', error_description: 'The redirect URI is not registered for this client.' } } });
  renderPage();
  expect(await screen.findByText('The redirect URI is not registered for this client.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'oauth.backToApp' })).not.toBeInTheDocument();
  expect(assign).not.toHaveBeenCalled();
});
