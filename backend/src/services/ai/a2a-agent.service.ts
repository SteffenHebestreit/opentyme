/**
 * A2A (Agent-to-Agent) adapter.
 * Wraps AIAssistantService so external agents can call OpenTYME
 * via the standard A2A protocol.
 *
 * Implements the @a2a-js/sdk AgentExecutor interface.
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger';
import { AIAssistantService } from './ai-assistant.service';
import type { EventEmitter } from './ai-assistant.service';

// ── Inline A2A types (avoids @a2a-js/sdk/server subpath import issues) ─────

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

interface MessagePart { kind: string; text?: string }
interface A2AMessage { parts?: MessagePart[]; [key: string]: unknown }
interface RequestContext {
  contextId?: string;
  userMessage?: A2AMessage;
  bearerToken?: string;
  userId?: string;
  [key: string]: unknown;
}
interface PublishableMessage {
  kind: 'message';
  messageId: string;
  role: 'agent';
  contextId?: string;
  parts: MessagePart[];
}
interface ExecutionEventBus {
  publish(msg: PublishableMessage): void;
  finished(): void;
}
interface AgentExecutor {
  execute(ctx: RequestContext, bus: ExecutionEventBus): Promise<void>;
  cancelTask?: () => Promise<void>;
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

export class OpenTyMEAgentExecutor implements AgentExecutor {
  private aiService: AIAssistantService;

  constructor(aiService: AIAssistantService) {
    this.aiService = aiService;
  }

  async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const message = requestContext.userMessage;
    let userText = '';
    if (message?.parts) {
      userText = message.parts
        .filter((p) => p.kind === 'text')
        .map((p) => p.text ?? '')
        .join('\n');
    }

    if (!userText) {
      logger.warn('[A2A] Received empty message');
      eventBus.publish({ kind: 'message', messageId: uuidv4(), role: 'agent', contextId: requestContext.contextId, parts: [{ kind: 'text', text: 'Please provide a message.' }] });
      eventBus.finished();
      return;
    }

    let responseText = '';
    const emit: EventEmitter = (event) => {
      if (event.type === 'TEXT_MESSAGE_CONTENT' && typeof event.delta === 'string') {
        responseText += event.delta;
      }
    };

    try {
      const bearerToken = requestContext.bearerToken ?? '';
      const userId = requestContext.userId ?? 'a2a-anonymous';

      await this.aiService.initialize(userId);
      await this.aiService.runStream(userId, requestContext.contextId ?? null, userText, 'External Agent', '', 'en', bearerToken, emit);

      eventBus.publish({ kind: 'message', messageId: uuidv4(), role: 'agent', contextId: requestContext.contextId, parts: [{ kind: 'text', text: responseText || 'Done.' }] });
      eventBus.finished();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`[A2A] Executor error: ${msg}`);
      eventBus.publish({ kind: 'message', messageId: uuidv4(), role: 'agent', contextId: requestContext.contextId, parts: [{ kind: 'text', text: `Error: ${msg}` }] });
      eventBus.finished();
    }
  }

  cancelTask = async (): Promise<void> => {};
}
