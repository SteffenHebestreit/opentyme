/**
 * A2A (Agent-to-Agent) agent card.
 * Describes OpenTyme's assistant to external agents. Served publicly at
 * /.well-known/agent-card.json (A2A 0.3) and /.well-known/agent.json (older
 * clients); the JSON-RPC endpoint it points to is POST /api/ai/a2a.
 */

export interface AgentCard {
  protocolVersion: string;
  name: string;
  description: string;
  url: string;
  preferredTransport: 'JSONRPC';
  version: string;
  provider: { organization: string; url: string };
  documentationUrl: string;
  capabilities: { streaming: boolean; pushNotifications: boolean; stateTransitionHistory: boolean };
  securitySchemes: Record<string, { type: 'http'; scheme: 'bearer'; description: string }>;
  security: Array<Record<string, string[]>>;
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: Array<{ id: string; name: string; description: string; tags: string[]; examples?: string[] }>;
}

/** The card for an OpenTyme installation reachable at `baseUrl` (no trailing slash). */
export function buildAgentCard(baseUrl: string): AgentCard {
  return {
    protocolVersion: '0.3.0',
    name: 'OpenTyme Assistant',
    description:
      'Time tracking and invoicing assistant for freelancers. Answers questions about and manages clients, ' +
      'projects, time entries, expenses, invoices and reports — limited to what the calling API token allows. ' +
      'Changes wait for approval: a task in state input-required lists them in a data part; reply on that task ' +
      'with a data part {"decision": "approve" | "reject"} (or per action: {"approvals": [{"toolCallId", "decision"}]}).',
    url: `${baseUrl}/api/ai/a2a`,
    preferredTransport: 'JSONRPC',
    version: '1.1.0',
    provider: { organization: 'OpenTyme', url: baseUrl },
    documentationUrl: `${baseUrl}/api-docs`,
    capabilities: { streaming: true, pushNotifications: false, stateTransitionHistory: false },
    securitySchemes: {
      openTymeApiToken: {
        type: 'http',
        scheme: 'bearer',
        description:
          'An OpenTyme API token (oty_pat_…) with the "OpenTyme assistant" feature, created under Configuration → API tokens.',
      },
    },
    security: [{ openTymeApiToken: [] }],
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['text/plain', 'application/json'],
    skills: [
      {
        id: 'time-tracking',
        name: 'Time tracking',
        description: 'Log, find and summarise time entries per client and project.',
        tags: ['time', 'timesheet'],
        examples: ['Log 2 hours on the website relaunch for today, 9 to 11.', 'How many hours did I work for Acme last month?'],
      },
      {
        id: 'invoicing',
        name: 'Invoicing',
        description: 'Look up invoices and payments, create invoices from time entries.',
        tags: ['invoice', 'payment'],
        examples: ['Which invoices are overdue?'],
      },
      {
        id: 'expenses',
        name: 'Expenses',
        description: 'Track and analyse expenses.',
        tags: ['expense'],
        examples: ['What did I spend on software this year?'],
      },
      {
        id: 'analytics',
        name: 'Reports and insights',
        description: 'Revenue, profit, utilisation and tax figures.',
        tags: ['analytics', 'report'],
        examples: ['What was my revenue per client in Q3?'],
      },
    ],
  };
}
