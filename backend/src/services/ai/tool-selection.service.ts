/**
 * Tool selection for the AI assistant.
 *
 * Two responsibilities:
 *  1. Role-based permissions — restrict which tools a user's roles may use
 *     (re-enforced at execution time in tool-executor.service.ts).
 *  2. Relevance curation — instead of sending all ~66 tools to the local model
 *     on every turn (which hurts accuracy and latency), always include a small
 *     core set plus the tools most relevant to the user's message, capped at a
 *     configurable maximum. Relevance uses LM Studio embeddings with a lexical
 *     fallback.
 */

import axios from 'axios';
import { logger } from '../../utils/logger';
import { getToolsWithMeta, LLMTool, ToolWithMeta } from './openapi-tool-builder.service';

// ~20 tools is the documented reliability cliff for small local models
// (arXiv 2411.15399; OpenAI function-calling guide: "aim for fewer than 20").
const MAX_TOOLS = Number(process.env.AI_MAX_TOOLS) || 20;
const EMBED_MODEL = process.env.AI_EMBED_MODEL || 'text-embedding-qwen3-embedding-0.6b';
const USE_EMBEDDINGS = (process.env.AI_TOOL_EMBEDDINGS ?? 'true') !== 'false';

// Tags only admins may use.
const ADMIN_ONLY_TAGS = new Set<string>([
  'Admin',
  'Admin - Tax Rates',
  'Admin - Invoice Templates',
  'User Profile (Admin)',
]);

// Always-available tools: entity resolution + summaries/overviews. These survive
// curation so name→id resolution and aggregate queries always work.
const CORE_TOOL_NAMES = new Set<string>([
  'get_clients',
  'get_projects',
  'get_time_entries',
  'get_invoices',
  'get_time_summary',
  'get_revenue_summary',
  'get_expense_summary',
  'get_profit_summary',
  'get_client_overview',
  'get_project_overview',
  'get_time_pattern',
]);

export function isAdminOnlyTool(tags: string[]): boolean {
  return tags.some((t) => ADMIN_ONLY_TAGS.has(t));
}

/** Whether the given roles may use a tool with these tags. */
export function isToolAllowedForRoles(tags: string[], roles: string[]): boolean {
  if (!isAdminOnlyTool(tags)) return true;
  return roles.includes('admin');
}

function toolText(t: ToolWithMeta): string {
  return `${t.tool.function.name} ${t.tool.function.description} ${t.tags.join(' ')}`.toLowerCase();
}

// ---- Relevance: embeddings (cached) + lexical fallback ----------------------

const toolEmbeddingCache = new Map<string, number[]>();

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

async function embed(inputs: string[], apiUrl: string, apiKey: string): Promise<number[][]> {
  const client = axios.create({
    baseURL: apiUrl,
    timeout: 20000,
    headers: { 'Content-Type': 'application/json', ...(apiKey && { Authorization: `Bearer ${apiKey}` }) },
  });
  const res = await client.post('/embeddings', { model: EMBED_MODEL, input: inputs });
  const data = (res.data?.data ?? []) as Array<{ embedding: number[] }>;
  return data.map((d) => d.embedding);
}

function lexicalScore(query: string, text: string): number {
  const words = new Set(query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
  let score = 0;
  for (const w of words) if (text.includes(w)) score++;
  return score;
}

function rankLexical(userMessage: string, rest: ToolWithMeta[]): ToolWithMeta[] {
  return [...rest].sort((a, b) => lexicalScore(userMessage, toolText(b)) - lexicalScore(userMessage, toolText(a)));
}

export interface SelectToolsOptions {
  userMessage: string;
  roles: string[];
  apiUrl?: string;
  apiKey?: string;
  /** Enables sticky per-conversation selection (prefix-cache friendly). */
  conversationId?: string;
}

// Sticky per-conversation tool selection (in-memory; single backend replica).
// Local inference servers only reuse their prompt/KV cache when the prompt
// prefix — which includes the rendered tool list — is byte-identical across
// turns. Reselecting tools from scratch each turn busts that cache and forces
// a full re-prefill of the conversation (documented: hermes-agent #27339).
// We therefore grow a conversation's tool set append-only and sort it
// deterministically; if it outgrows the ceiling, we reset once to the current
// selection (one cache miss, then stable again).
const conversationTools = new Map<string, Set<string>>();
const MAX_TRACKED_CONVERSATIONS = 500;
const STICKY_CEILING = Math.floor(MAX_TOOLS * 1.5);

function rememberConversationTools(conversationId: string, names: Set<string>): void {
  if (conversationTools.size >= MAX_TRACKED_CONVERSATIONS && !conversationTools.has(conversationId)) {
    const oldest = conversationTools.keys().next().value;
    if (oldest !== undefined) conversationTools.delete(oldest);
  }
  conversationTools.set(conversationId, names);
}

/**
 * Returns the curated, role-filtered set of tools for a single run:
 * the core set plus the most relevant remaining tools, capped at AI_MAX_TOOLS.
 */
export async function selectTools(opts: SelectToolsOptions): Promise<LLMTool[]> {
  const { userMessage, roles, apiUrl, apiKey, conversationId } = opts;

  const allowed = getToolsWithMeta().filter((t) => isToolAllowedForRoles(t.tags, roles));
  const core = allowed.filter((t) => CORE_TOOL_NAMES.has(t.tool.function.name));
  const rest = allowed.filter((t) => !CORE_TOOL_NAMES.has(t.tool.function.name));

  const budget = Math.max(0, MAX_TOOLS - core.length);
  if (rest.length <= budget) {
    return finalizeSelection([...core, ...rest], allowed, conversationId);
  }

  let ranked: ToolWithMeta[];
  let usedEmbeddings = false;
  if (USE_EMBEDDINGS && apiUrl) {
    try {
      const missing = rest.filter((t) => !toolEmbeddingCache.has(t.tool.function.name));
      if (missing.length > 0) {
        const vecs = await embed(missing.map(toolText), apiUrl, apiKey ?? '');
        missing.forEach((t, i) => {
          if (vecs[i]) toolEmbeddingCache.set(t.tool.function.name, vecs[i]);
        });
      }
      const [queryVec] = await embed([userMessage], apiUrl, apiKey ?? '');
      if (queryVec) {
        ranked = [...rest].sort((a, b) => {
          const va = toolEmbeddingCache.get(a.tool.function.name);
          const vb = toolEmbeddingCache.get(b.tool.function.name);
          return (vb ? cosine(queryVec, vb) : -1) - (va ? cosine(queryVec, va) : -1);
        });
        usedEmbeddings = true;
      } else {
        ranked = rankLexical(userMessage, rest);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`[AI ToolSelection] Embedding ranking failed, using lexical fallback: ${msg}`);
      ranked = rankLexical(userMessage, rest);
    }
  } else {
    ranked = rankLexical(userMessage, rest);
  }

  const selected = ranked.slice(0, budget);
  logger.info(
    `[AI ToolSelection] ${core.length} core + ${selected.length}/${rest.length} ranked ` +
      `(${usedEmbeddings ? 'embeddings' : 'lexical'}); ${allowed.length} allowed for roles [${roles.join(',')}]`
  );
  return finalizeSelection([...core, ...selected], allowed, conversationId);
}

/**
 * Applies sticky per-conversation union (bounded) and deterministic ordering,
 * then returns the tool definitions. Deterministic name order keeps the
 * serialized tool list byte-stable so the inference server's prefix cache
 * survives across turns.
 */
function finalizeSelection(
  picked: ToolWithMeta[],
  allowed: ToolWithMeta[],
  conversationId?: string
): LLMTool[] {
  let names = new Set(picked.map((t) => t.tool.function.name));

  if (conversationId) {
    const prev = conversationTools.get(conversationId);
    if (prev) {
      const union = new Set([...prev, ...names]);
      if (union.size <= STICKY_CEILING) {
        names = union;
      } else {
        logger.info(`[AI ToolSelection] Sticky set exceeded ${STICKY_CEILING} — resetting to current selection`);
      }
    }
    rememberConversationTools(conversationId, names);
  }

  return allowed
    .filter((t) => names.has(t.tool.function.name))
    .sort((a, b) => a.tool.function.name.localeCompare(b.tool.function.name))
    .map((t) => t.tool);
}
