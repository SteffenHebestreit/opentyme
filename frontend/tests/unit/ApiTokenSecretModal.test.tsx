/**
 * The one-time token dialog offers setups only for what the token may do.
 */
import { render, screen } from '@testing-library/react';
import { ApiTokenSecretModal } from '../../src/components/admin/api-tokens/ApiTokenSecretModal';
import type { ApiToken, ApiTokenCapability } from '../../src/api/types';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

const SECRET = 'oty_pat_TestSecret';

function open(capabilities: ApiTokenCapability[]) {
  const token = { id: 't1', name: 'Agent', permissions: { resources: {}, capabilities } } as unknown as ApiToken;
  render(<ApiTokenSecretModal result={{ token, secret: SECRET }} onClose={jest.fn()} />);
}

const L = 'admin.apiTokens.secret';

it('always shows the token and how to try it', () => {
  open([]);
  expect(screen.getByText(SECRET)).toBeInTheDocument();
  expect(screen.getByText(new RegExp(`curl -H "Authorization: Bearer ${SECRET}"`))).toBeInTheDocument();
  expect(screen.queryByText(`${L}.mcpClaudeCode`)).not.toBeInTheDocument();
  expect(screen.queryByText(`${L}.a2a`)).not.toBeInTheDocument();
});

it('offers the MCP setups for an MCP token', () => {
  open(['mcp']);
  expect(screen.getByText(`${L}.mcpClaudeCode`)).toBeInTheDocument();
  expect(
    screen.getByText(`claude mcp add --transport http opentyme http://localhost/api/mcp --header "Authorization: Bearer ${SECRET}"`)
  ).toBeInTheDocument();
  expect(screen.getByText(/"mcpServers"/)).toBeInTheDocument();
});

it('offers the agent card for an assistant token', () => {
  open(['assistant']);
  expect(screen.getByText('http://localhost/.well-known/agent-card.json')).toBeInTheDocument();
});
