/**
 * A2A (Agent-to-Agent) agent card.
 * Describes OpenTYME's assistant to external agents (served at
 * /.well-known/agent.json). The full A2A executor was removed as dead code —
 * the /api/ai/a2a endpoint answers with a pointer to the authenticated AG-UI
 * endpoint instead (see routes/ai/ai-assistant.routes.ts).
 */

interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  protocolVersion?: string;
  capabilities: { streaming: boolean; pushNotifications: boolean };
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: Array<{ id: string; name: string; description?: string; tags?: string[] }>;
}

export const openTyMEAgentCard: AgentCard = {
  name: 'OpenTYME AI Assistant',
  description: 'Time tracking & invoicing agent for freelancers. Can query and manage clients, projects, time entries, expenses, invoices, and analytics.',
  protocolVersion: '0.3.0',
  version: '1.0.0',
  url: process.env.PUBLIC_URL ?? 'http://localhost',
  skills: [
    { id: 'time-tracking', name: 'Time Tracking', description: 'Query and manage time entries', tags: ['time'] },
    { id: 'invoicing', name: 'Invoicing', description: 'Create and manage invoices', tags: ['invoice'] },
    { id: 'expenses', name: 'Expense Management', description: 'Track and analyze expenses', tags: ['expense'] },
    { id: 'analytics', name: 'Analytics & Reports', description: 'Generate reports and insights', tags: ['analytics'] },
  ],
  capabilities: { streaming: true, pushNotifications: false },
  defaultInputModes: ['text/plain'],
  defaultOutputModes: ['text/plain'],
};
