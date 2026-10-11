/**
 * @fileoverview AI-powered Depreciation Analysis Service (AfA)
 *
 * Enhanced with comprehensive German tax law context, AfA tables,
 * and support for multiple AI providers.
 *
 * Every result carries its `source`: 'ai' when the model produced it, 'rules'
 * when the built-in German tax rules had to stand in (AI disabled or failed —
 * then `ai_error_code` says why). A rules result must never be presented or
 * stored as an AI analysis.
 */

import axios, { AxiosInstance } from 'axios';
import { logger } from '../../utils/logger';
import { getDbClient } from '../../utils/database';
import { classifyUpstreamError } from '../../utils/upstream-error';
import { mcpClient } from '../mcp/mcp-client.service';

export type DepreciationAnalysisSource = 'ai' | 'rules';

/** Why a rules-based result was returned instead of an AI analysis (API contract §5). */
export type AIDepreciationErrorCode =
  | 'AI_UNREACHABLE'
  | 'AI_TIMEOUT'
  | 'AI_AUTH'
  | 'AI_DISABLED'
  | 'AI_INVALID_RESPONSE';

export interface DepreciationAnalysis {
  recommendation: 'none' | 'immediate' | 'partial';
  reasoning: string;
  suggested_years?: number | null;
  useful_life_category?: string;
  suggested_category?: string; // AI-suggested expense category (computer, software, insurance, etc.)
  category_reasoning?: string; // Why this category was suggested
  tax_deductible_amount: number;
  tax_deductible_percentage: number; // 0-100, percentage that is tax-deductible
  tax_deductibility_reasoning: string; // Why this percentage is/isn't fully deductible
  references?: string[];
  sources?: Array<{ title: string; url: string }>; // Web sources used for analysis
  confidence: number;
  gwg_applicable?: boolean;
  requires_depreciation?: boolean;
  /** 'ai' = produced by the model, 'rules' = built-in fallback rules. */
  source: DepreciationAnalysisSource;
  /** Set when source is 'rules' because the AI was disabled or failed. */
  ai_error_code?: AIDepreciationErrorCode;
}

export interface ExpenseForAnalysis {
  id: string;
  description: string;
  notes?: string; // Additional context/details about the expense
  category: string;
  amount: number;
  net_amount: number;
  tax_amount: number;
  tax_rate: number;
  expense_date: string;
}

/** § 6 Abs. 2 EStG: immediate write-off up to and including 800 € net (GWG). */
export const GWG_LIMIT_NET = 800;
/** Up to 250 € net no GWG record keeping — a plain operating expense. */
export const SMALL_ASSET_LIMIT_NET = 250;
/** § 6 Abs. 2a EStG: Sammelposten (pool) for assets above 250 € and up to 1000 € net. */
export const POOL_LIMIT_NET = 1000;
/** Useful life assumed when neither the category nor the description identify the asset. */
const DEFAULT_USEFUL_LIFE_YEARS = 5;

/** Keyword table (description / category words) → useful life in years. */
const AfA_TABLE: { [key: string]: number } = {
  // IT Equipment (seit 2021: 1 Jahr statt 3 Jahre!)
  'computer': 1, 'laptop': 1, 'tablet': 1, 'printer': 1, 'scanner': 1,
  'router': 1, 'server': 1, 'software': 1, 'monitor': 1, 'peripherie': 1,
  'tastatur': 1, 'maus': 1, 'headset': 1, 'mikrofon': 1, 'webcam': 1,
  'festplatte': 1, 'usb': 1, 'docking': 1, 'beamer': 1, 'display': 1,

  // Office Furniture
  'desk': 13, 'chair': 13, 'cabinet': 13, 'furniture': 13,

  // Other Equipment
  'phone_system': 5, 'coffee_machine': 5, 'air_conditioning': 10,
  'car': 6, 'pkw': 6, 'motorcycle': 7, 'bicycle': 7, 'ebike': 7,
  'camera': 7, 'projector': 7, 'hand_tools': 5, 'kopiergerät': 7,
};

/**
 * Useful life per app expense category (the values of ExpenseCategory).
 * Computer hardware incl. peripherals and software: 1 year (BMF-Schreiben
 * vom 26.02.2021 / 22.02.2022); the rest follows the BMF AfA table for
 * generally usable assets. Categories without a single typical useful life
 * (office_equipment, machinery, other) are resolved from the description.
 */
const CATEGORY_USEFUL_LIFE: { [category: string]: number } = {
  computer: 1,
  software: 1,
  peripherals: 1,
  storage: 1,
  display: 1,
  printer: 1,
  office_furniture: 13,
  vehicle_car: 6,
  vehicle_motorcycle: 7,
  camera: 7,
  tools: 5,
};

/**
 * Categories that are running business expenses, not assets: deductible in
 * full in the year they are paid, whatever the amount (§ 4 Abs. 4 EStG).
 */
const OPERATING_EXPENSE_CATEGORIES = new Set([
  'insurance',
  'professional_services',
  'marketing',
  'utilities',
  'travel',
  'meals',
  'training',
  'rent',
  'telecommunications',
  'office_supplies',
]);

/** Official references offered to the model when no web search ran. */
const REFERENCE_SOURCES = {
  afa: {
    title: 'BMF AfA-Tabelle für allgemein verwendbare Anlagegüter',
    url: 'https://www.bundesfinanzministerium.de/Content/DE/Standardartikel/Themen/Steuern/Weitere_Steuerthemen/Betriebspruefung/AfA-Tabellen/afa-tabellen.html',
  },
  gwg: { title: '§ 6 EStG (Geringwertige Wirtschaftsgüter, Sammelposten)', url: 'https://www.gesetze-im-internet.de/estg/__6.html' },
  linear: { title: '§ 7 EStG (Absetzung für Abnutzung)', url: 'https://www.gesetze-im-internet.de/estg/__7.html' },
  operating: { title: '§ 4 EStG (Betriebsausgaben)', url: 'https://www.gesetze-im-internet.de/estg/__4.html' },
};

/** Request timeout for the analysis — large local reasoning models are slow. */
const AI_TIMEOUT_MS = 180_000;
/** Extra attempts after an unusable (empty / non-JSON) answer. Transport errors are never retried. */
const MAX_INVALID_RESPONSE_RETRIES = 1;

const SYSTEM_PROMPT =
  'You are a German tax law expert specialized in asset depreciation (AfA - Absetzung für Abnutzung) according to § 7 EStG. CRITICAL: You MUST respond with ONLY valid JSON - no text before or after, no markdown code blocks, no explanations. Ensure all JSON is properly formatted with correct commas, quotes, and brackets. WICHTIG: Computer/IT-Geräte haben seit 2021 nur 1 Jahr Nutzungsdauer!';

const AVAILABLE_CATEGORIES_SECTION = `# AVAILABLE EXPENSE CATEGORIES:
Choose the most appropriate category for this expense:

**IT & Digital Equipment (1 year AfA):**
- "computer" = Computer, Laptop, Tablet, Workstation, Server
- "software" = Software, Licenses, SaaS subscriptions
- "peripherals" = Keyboard, Mouse, Headset, Webcam, Docking Station
- "storage" = External HDD, USB drives, NAS
- "display" = Monitors, Displays, Projectors
- "printer" = Printers, Scanners, Multifunction devices

**Office Equipment:**
- "office_furniture" = Desks, Chairs, Shelves (13 years)
- "office_equipment" = Phones, Copiers (5-7 years)
- "office_supplies" = Consumables, stationery (immediate)

**Vehicles:**
- "vehicle_car" = Cars, passenger vehicles (6 years)
- "vehicle_motorcycle" = Motorcycles, E-bikes (7 years)

**Professional Tools:**
- "camera" = Photography equipment (7 years)
- "tools" = Hand tools, equipment (5 years)
- "machinery" = Larger machinery (varies)

**Services & Operating Expenses:**
- "insurance" = Business insurance (Berufshaftpflicht, KFZ-Versicherung, etc.)
- "professional_services" = Accountant, lawyer, consultants
- "marketing" = Marketing, advertising, website
- "utilities" = Electricity, water, heating, gas
- "travel" = Business travel, hotels, transportation
- "meals" = Business meals (often 70% deductible)
- "training" = Courses, workshops, professional development
- "rent" = Office/business space rent
- "telecommunications" = Phone, internet, mobile contracts

**Other:**
- "other" = Anything that doesn't fit above categories
`;

const TAX_DEDUCTIBILITY_SECTION = `## TAX DEDUCTIBILITY Analysis
Determine WHAT PERCENTAGE is tax-deductible (INDEPENDENT from depreciation!):

### 100% Deductible (Full Business Expenses):
- Business insurance (Berufshaftpflicht, Betriebshaftpflicht)
- Professional services (Steuerberater, Anwalt, Consultants)
- Office equipment and supplies (100% business use)
- Business software and subscriptions
- Business travel
- Vehicle expenses if 100% business use

### PARTIALLY Deductible (Mixed Business/Private Use):
**IMPORTANT: Base percentage on actual business vs. private usage ratio!**

Examples:
- Vehicle insurance: If car used 30% for business → 30% tax-deductible
- Home office costs: If 15% of home used for office → 15% deductible
- Phone/internet: If 60% business use → 60% deductible
- Vehicle insurance: If driving 12,000 business km out of 20,000 total km → 60% deductible

For these expenses:
1. Estimate business use percentage from description
2. Set tax_deductible_percentage accordingly (0-100)
3. Explain reasoning: "Geschätzter Geschäftsanteil: X%, basierend auf [reason]"

### 0% Deductible (Private/Personal):
- Private health insurance (Krankenversicherung) - personal coverage
- Personal liability insurance (Privathaftpflicht)
- Life insurance (Lebensversicherung)
- Private travel, meals, entertainment

**For insurance expenses:** ALWAYS analyze business vs. private use ratio!
- Berufshaftpflicht (professional liability): 100% deductible
- KFZ-Versicherung (car insurance): Depends on business use percentage (e.g., 30% business → 30% deductible)
- Private health/life insurance: 0% deductible (unless special business conditions)
`;

interface ResearchContext {
  /** True only when a web search actually returned results. */
  webSearch: boolean;
  /** Search results (webSearch) or built-in background notes (no web search). */
  content: string;
  /** Links the model may cite. */
  sources: Array<{ title: string; url: string }>;
}

/**
 * Remove chain-of-thought blocks from a model answer: complete <think>…</think>
 * blocks, everything before a dangling </think> (opening tag in the chat
 * template) and an unclosed trailing <think>.
 */
function stripReasoning(text: string): string {
  let result = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const lastClose = result.toLowerCase().lastIndexOf('</think>');
  if (lastClose !== -1) result = result.slice(lastClose + '</think>'.length);
  return result.replace(/<think>[\s\S]*$/i, '').trim();
}

/** Month (1-12) of an ISO date string, read from the string itself (no timezone shift). */
function purchaseMonthOf(date: string): number {
  const match = /^(\d{4})-(\d{2})/.exec(date ?? '');
  if (match) {
    const month = Number(match[2]);
    if (month >= 1 && month <= 12) return month;
  }
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? new Date().getMonth() + 1 : parsed.getMonth() + 1;
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

export class AIDepreciationService {
  private client: AxiosInstance | null = null;
  private apiUrl: string | undefined = undefined;
  private apiKey: string | null = null;
  private model: string = 'qwen/qwen3-v1-30b';
  private provider: string = 'local';
  private enabled: boolean = false;
  private userId: string | null = null;

  async initialize(userId: string): Promise<void> {
    try {
      this.userId = userId;
      const settings = await this.getUserSettings(userId);

      if (!settings || !settings.ai_enabled) {
        logger.info('AI depreciation analysis is disabled');
        this.enabled = false;
        return;
      }

      this.enabled = true;
      this.provider = settings.ai_provider || 'local';
      this.apiUrl = settings.ai_api_url || 'http://localhost:1234/v1';
      this.apiKey = settings.ai_api_key || '';
      this.model = settings.ai_model || 'qwen/qwen3-v1-30b';

      this.client = axios.create({
        baseURL: this.apiUrl,
        timeout: AI_TIMEOUT_MS,
        headers: {
          'Content-Type': 'application/json',
          ...this.authHeaders(),
        },
      });

      logger.info(`AI depreciation init: provider ${this.provider}, model ${this.model}`);
    } catch (error: any) {
      logger.error('Failed to initialize AI depreciation service:', error.message);
      this.enabled = false;
    }
  }

  private isAnthropic(): boolean {
    return this.provider === 'claude' || this.provider === 'anthropic';
  }

  /**
   * Authentication headers for the configured provider: Anthropic's Messages
   * API takes `x-api-key`, every OpenAI-compatible server a Bearer token.
   */
  private authHeaders(): Record<string, string> {
    if (!this.apiKey) return {};
    if (this.isAnthropic()) {
      return { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' };
    }
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  private async getUserSettings(userId: string): Promise<any> {
    try {
      const pool = getDbClient();
      const result = await pool.query(
        `SELECT ai_enabled, ai_provider, ai_api_url, ai_api_key, ai_model
        FROM settings WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return {
          ai_enabled: false,
          ai_provider: 'local',
          ai_api_url: 'http://localhost:1234/v1',
          ai_model: 'qwen/qwen3-v1-30b',
        };
      }

      return result.rows[0];
    } catch (error: any) {
      logger.error('Error fetching user settings:', error.message);
      return null;
    }
  }

  /**
   * Analyse an expense. Never throws for AI problems: when the AI is disabled
   * or fails, the rules-based result is returned with `source: 'rules'` and
   * the reason in `ai_error_code`.
   */
  async analyzeExpense(expense: ExpenseForAnalysis): Promise<DepreciationAnalysis> {
    if (!this.enabled || !this.client) {
      logger.info('[AfA] AI not enabled, using rules-based analysis');
      return this.basicDepreciationRules(expense, 'AI_DISABLED');
    }

    logger.info(`[AfA] Analyzing expense ${expense.id}`);
    const research = await this.gatherResearch(expense);
    const prompt = this.buildAnalysisPrompt(expense, research);

    for (let attempt = 0; attempt <= MAX_INVALID_RESPONSE_RETRIES; attempt++) {
      let answer: { content: string | null; finishReason?: string };
      try {
        answer = await this.requestAnalysis(prompt);
      } catch (error: any) {
        // Connection errors, timeouts and HTTP errors are not retried: a
        // server that is down or too slow only multiplies the wait.
        const code = this.toErrorCode(error);
        logger.warn(`[AfA] AI request failed (${code}): ${error?.message}`);
        return this.basicDepreciationRules(expense, code);
      }

      const content = answer.content ? stripReasoning(answer.content) : '';
      // Qwen-style tool calls are not executed here; drop them and look for JSON.
      const withoutToolCalls = content.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim();

      if (withoutToolCalls) {
        try {
          return this.parseAIResponse(withoutToolCalls, expense, research.sources);
        } catch (parseError: any) {
          logger.warn(`[AfA] Could not parse AI answer (attempt ${attempt + 1}): ${parseError.message}`);
        }
      } else {
        logger.warn(
          `[AfA] AI returned no answer content (attempt ${attempt + 1}, finish_reason=${answer.finishReason})`
        );
      }

      // A model that ran out of token budget will do so again.
      if (answer.finishReason === 'length') break;
    }

    return this.basicDepreciationRules(expense, 'AI_INVALID_RESPONSE');
  }

  /**
   * Send the prompt to the configured provider and return the answer text
   * (never the hidden reasoning).
   */
  private async requestAnalysis(
    prompt: string
  ): Promise<{ content: string | null; finishReason?: string }> {
    if (this.isAnthropic()) {
      const response = await this.client!.post('/messages', {
        model: this.model,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
      });
      const data = response.data ?? {};
      const text = Array.isArray(data.content)
        ? data.content
            .filter((part: any) => part?.type === 'text' && typeof part.text === 'string')
            .map((part: any) => part.text)
            .join('')
        : '';
      return {
        content: text.trim() ? text : null,
        finishReason: data.stop_reason === 'max_tokens' ? 'length' : data.stop_reason,
      };
    }

    // Every other provider (OpenAI, LM Studio, Azure, custom) speaks the
    // OpenAI-compatible chat completions API.
    const response = await this.client!.post('/chat/completions', {
      model: this.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      // Reasoning models (Qwen3, gpt-oss, …) spend this budget on hidden
      // reasoning before emitting a single token of answer. At 800 the
      // budget was exhausted mid-thought on every attempt and the analysis
      // never actually ran on a reasoning model.
      max_tokens: 12000,
    });

    const choice = response.data?.choices?.[0];
    const content = choice?.message?.content;
    return {
      content: typeof content === 'string' && content.trim() ? content : null,
      finishReason: choice?.finish_reason,
    };
  }

  private toErrorCode(error: unknown): AIDepreciationErrorCode {
    const failure = classifyUpstreamError(error);
    switch (failure.kind) {
      case 'unreachable':
        return 'AI_UNREACHABLE';
      case 'timeout':
        return 'AI_TIMEOUT';
      case 'auth':
        return 'AI_AUTH';
      default:
        return 'AI_INVALID_RESPONSE';
    }
  }

  /**
   * Collect context for the prompt. Runs a web search only when the MCP
   * gateway is connected; otherwise hands the model the built-in notes and
   * official reference links, labelled as such.
   */
  private async gatherResearch(expense: ExpenseForAnalysis): Promise<ResearchContext> {
    const searchContext = expense.notes
      ? `${expense.description} ${expense.notes}`
      : expense.description;
    const fullText = `${expense.description} ${expense.notes || ''}`.toLowerCase();
    const isInsurance = fullText.includes('versicherung') || fullText.includes('insurance');

    if (mcpClient.isConnected()) {
      let content = '';
      let sources: Array<{ title: string; url: string }> = [];

      const afaResult = await this.executeWebSearch(
        `${searchContext} ${expense.category} AfA Nutzungsdauer Abschreibung Steuerrecht`
      );
      if (afaResult) {
        content = afaResult.content;
        sources = afaResult.sources;
      }

      // For high-value expenses or specific models, fetch detailed content
      const hasSpecificModel = /[A-Z]{2,}\s+[A-Z0-9]{2,}/i.test(expense.description);
      if ((expense.net_amount > GWG_LIMIT_NET || hasSpecificModel) && sources[0]?.url) {
        try {
          const fetchResult = await mcpClient.callTool('gateway', 'fetch_content', {
            url: sources[0].url,
          });
          if (fetchResult.content && Array.isArray(fetchResult.content)) {
            const fetchedContent = fetchResult.content
              .filter((item: any) => item.type === 'text')
              .map((item: any) => item.text)
              .join('\n');
            if (fetchedContent) {
              content += `\n\n## Content of ${sources[0].url}:\n${fetchedContent.substring(0, 2000)}`;
            }
          }
        } catch (fetchError: any) {
          logger.warn('[Web Search] Failed to fetch detailed content:', fetchError.message);
        }
      }

      if (isInsurance) {
        const insuranceResult = await this.executeWebSearch(
          `${searchContext} steuerliche Absetzbarkeit Betriebsausgabe`
        );
        if (insuranceResult) {
          content += `\n\n## Insurance tax deductibility:\n${insuranceResult.content}`;
          sources = [...sources, ...insuranceResult.sources];
        }
      }

      if (content.trim()) {
        logger.info(`[Web Search] Research complete: ${sources.length} sources found`);
        return { webSearch: true, content, sources };
      }
      logger.info('[Web Search] No usable search results, using built-in notes');
    }

    return {
      webSearch: false,
      content: isInsurance ? this.getInsuranceNotes(fullText) : '',
      sources: isInsurance
        ? [REFERENCE_SOURCES.operating]
        : [REFERENCE_SOURCES.afa, REFERENCE_SOURCES.gwg, REFERENCE_SOURCES.linear],
    };
  }

  /**
   * Run a web search through the MCP gateway. Returns null when the search
   * failed or found nothing.
   */
  private async executeWebSearch(
    query: string
  ): Promise<{ content: string; sources: Array<{ title: string; url: string }> } | null> {
    try {
      const searchResponse = await mcpClient.callTool('gateway', 'search', {
        query,
        max_results: 5
      });

      let content = '';
      const sources: Array<{ title: string; url: string }> = [];

      // Parse MCP response content
      if (searchResponse.content && Array.isArray(searchResponse.content)) {
        for (const item of searchResponse.content) {
          if (item.type === 'text') {
            content += item.text + '\n';
          } else if (item.type === 'resource' && item.resource) {
            // Extract resource information
            sources.push({
              title: item.resource.name || item.resource.uri || 'Resource',
              url: item.resource.uri || item.resource.url || ''
            });
          }
        }
      } else if (typeof searchResponse.content === 'string') {
        content = searchResponse.content;
      }

      // Extract URLs from content text using regex
      const urlRegex = /https?:\/\/[^\s)]+/g;
      const urls = content.match(urlRegex) || [];

      // Add URLs as sources if we don't have enough
      if (sources.length < 3) {
        urls.slice(0, 5 - sources.length).forEach((url, index) => {
          // Avoid duplicates
          if (!sources.find(s => s.url === url)) {
            sources.push({
              title: `Source ${sources.length + index + 1}`,
              url: url
            });
          }
        });
      }

      if (content.trim()) {
        return { content, sources };
      }
      logger.warn('[Web Search] No results from MCP search');
      return null;
    } catch (error: any) {
      logger.warn('[Web Search] Search failed:', error.message);
      return null;
    }
  }

  /**
   * Built-in background notes on insurance deductibility. Used only when no
   * web search ran; the prompt labels them as built-in, not as search results.
   */
  private getInsuranceNotes(lowerQuery: string): string {
    // General car insurance info
    if (lowerQuery.includes('kfz-versicherung') || lowerQuery.includes('versicherung') && lowerQuery.includes('auto')) {
      return `KFZ-Versicherung (Car Insurance) - Tax Deductibility:
• Type: Operating expense (Betriebsausgabe), NOT an asset
• Depreciation: Immediate deduction (Sofortabschreibung)
• Tax Deductibility: Depends on business vs. private use
  - 100% business vehicle: 100% deductible
  - Mixed use (Fahrtenbuch): Percentage based on business km / total km
  - Mixed use (1% Regelung): Typically 50-80% deductible for self-employed
  - < 10% business use: Not deductible
• Recommendation: Use actual Fahrtenbuch (mileage log) for accurate percentage`;
    }

    // Professional liability insurance
    if (lowerQuery.includes('berufshaftpflicht') || lowerQuery.includes('betriebshaftpflicht')) {
      return `Berufshaftpflicht/Betriebshaftpflicht (Professional Liability Insurance):
• Type: Operating expense, immediate deduction
• Tax Deductibility: 100% (fully deductible as business expense)
• Reasoning: Exclusively for business purposes
• § Reference: § 4 Abs. 4 EStG (Betriebsausgaben)`;
    }

    // Health insurance
    if (lowerQuery.includes('krankenversicherung') || lowerQuery.includes('health insurance')) {
      return `Krankenversicherung (Health Insurance):
• Type: Operating expense
• Tax Deductibility: Generally 0% as business expense
• Exception: Special business-related health insurance may be partially deductible
• Note: Can be deducted as Sonderausgaben (special expenses) in personal tax return, but NOT as business expense`;
    }

    return `Insurance (Versicherung) - General Guidelines:
• Type: Operating expense, NOT an asset
• Depreciation: Always immediate deduction (Sofortabschreibung)
• Category: "insurance"
• Tax Deductibility varies by type:
  - Business insurance (Berufshaftpflicht): 100%
  - Vehicle insurance (KFZ): depends on the business-use share
  - Professional equipment insurance: 100%
  - Private health/life insurance: 0% (not a business expense)
• Recommendation: Estimate based on business use percentage`;
  }

  private buildAnalysisPrompt(expense: ExpenseForAnalysis, research: ResearchContext): string {
    const purchaseMonth = purchaseMonthOf(expense.expense_date);
    const monthsOwned = 13 - purchaseMonth;

    let contextSection = '';
    if (research.webSearch) {
      contextSection = `\n\n# WEB SEARCH RESULTS (from an automated web search — verify before relying on them):\n${research.content}\n`;
    } else if (research.content) {
      contextSection = `\n\n# BACKGROUND NOTES (built-in guidance — no web search was performed):\n${research.content}\n`;
    }

    const sourcesListName = research.webSearch ? 'SEARCH SOURCES' : 'REFERENCE LINKS';
    const sourcesSection = research.sources.length > 0
      ? `\n\n# ${sourcesListName}${
          research.webSearch ? ' (found by the web search)' : ' (official legal texts — no web search was performed)'
        }:\n${research.sources.map(s => `- ${s.title}: ${s.url}`).join('\n')}\n`
      : '';

    const basis = research.webSearch
      ? 'its actual description and the web search results above'
      : 'its actual description and German tax law';

    return `You are a German tax advisor analyzing business expenses for depreciation and tax deductibility.${contextSection}${sourcesSection}

# EXPENSE TO ANALYZE:
Description: "${expense.description}"
${expense.notes ? `Notes: "${expense.notes}"` : ''}
Category: "${expense.category}"
Net Amount: ${expense.net_amount}€
Date: ${expense.expense_date}

**IMPORTANT: Analyze THIS specific expense based on ${basis}${expense.notes ? ' and its notes' : ''}. Do not use examples as templates.**

# GERMAN TAX LAW

## STEP 1: IDENTIFY TYPE

**Determine if this is an OPERATING EXPENSE or DEPRECIABLE ASSET:**

OPERATING EXPENSES (immediate deduction, suggested_years = 0):
- Services: consulting, accounting, legal, marketing, subscriptions
- Utilities: electricity, water, internet, telecommunications
- Insurance: any type (Versicherung)
- Consumables: office supplies, materials used up quickly
- Rent, travel, meals, repairs/maintenance

DEPRECIABLE ASSETS (Wirtschaftsgüter des Anlagevermögens):
- Tangible items that are used for more than one year
- Examples: computers, furniture, machinery, vehicles

## STEP 2: DEPRECIATION RULES (net amounts)

For OPERATING EXPENSES:
- recommendation = "immediate", suggested_years = 0

For ASSETS:
- Net amount up to and including 800 € (GWG, § 6 Abs. 2 EStG): recommendation = "immediate"
- Net amount above 800 € and up to 1000 €: NO immediate write-off. recommendation = "partial" with
  the AfA useful life; mention in the reasoning that the Sammelposten (pool, § 6 Abs. 2a EStG,
  5 years at 20 %) is an alternative for assets from 250 € to 1000 €
- Net amount above 1000 €: recommendation = "partial", suggested_years = useful life from the AfA table
- Computer hardware, peripherals and software: useful life 1 year (BMF 2021/2022), so above 800 €
  use recommendation = "partial" with suggested_years = 1

AfA Table (Useful Life):
- IT Equipment (since 2021): 1 year
- Office furniture: 13 years
- Vehicles (PKW): 6 years
- Vehicles (Motorcycle): 7 years

Pro-rata first year: Purchase month ${purchaseMonth} = ${monthsOwned}/12 months

## STEP 3: TAX DEDUCTIBILITY

General rules:
- 100% business expenses: Fully deductible (Berufshaftpflicht, office equipment)
- Mixed use: Partially deductible (car insurance, home office)
- Private: 0% deductible (private health/life insurance)

# TASK - Follow these steps in order:
1. **Suggest the correct expense category** based on description (see list below)
2. **Determine depreciation method** (STEP 2)
3. **Calculate first-year deduction** (pro-rata: ${monthsOwned} von 12 Monaten)
4. **Determine tax deductibility percentage** (0-100% based on business vs. private use)
5. **Provide reasoning** with § references

${AVAILABLE_CATEGORIES_SECTION}
# FORMAT (JSON only, no markdown, no tool_call tags):
{
  "recommendation": "immediate" | "partial",
  "reasoning": "DEPRECIATION: Brief explanation",
  "suggested_years": 0,
  "suggested_category": "computer",
  "category_reasoning": "Brief explanation why this category fits",
  "tax_deductible_percentage": 100,
  "tax_deductibility_reasoning": "TAX DEDUCTIBILITY: Explanation",
  "confidence": 0.90,
  "sources": [
    { "title": "Title copied from the ${sourcesListName} list", "url": "URL copied from the ${sourcesListName} list" }
  ]
}

**CRITICAL: For "suggested_category", use ONLY the category CODE in quotes from the list above!**
Examples of CORRECT category values:
- "computer" (NOT "Computer" or "IT & Digital Equipment")
- "insurance" (NOT "Business insurance")
- "professional_services" (NOT "Professional Services")
- "office_furniture" (NOT "Office Equipment - Furniture")

**Sources:** In "sources", list only entries from the ${sourcesListName} list above that support your
answer, copying title and url exactly. Use an empty array when none apply. Never invent URLs.

**Category Suggestion Guidelines:**
- Analyze the ACTUAL expense description carefully
- Match to the most appropriate category from the list above
- Don't assume categories based on examples - use the real data
- Provide clear reasoning for your category choice

${TAX_DEDUCTIBILITY_SECTION}
**Set both fields:**
- "tax_deductible_percentage" (0-100): The percentage that can be declared
- "tax_deductibility_reasoning": Start with "TAX DEDUCTIBILITY:" and explain the percentage

CRITICAL: Your response will be parsed by JSON.parse(). It MUST be valid JSON with:
- All strings in double quotes (not single quotes)
- All property names in double quotes
- Commas between all properties (no trailing commas)
- Proper escaping of special characters in strings
- No comments, no extra text

Respond with ONLY valid JSON - nothing before the opening {, nothing after the closing }.`;
  }

  private parseAIResponse(
    aiContent: string,
    expense: ExpenseForAnalysis,
    offeredSources: Array<{ title: string; url: string }> = []
  ): DepreciationAnalysis {
    logger.debug(`[AfA] AI answer: ${aiContent.length} chars`);

    // Try to extract JSON from markdown code blocks or plain JSON
    const jsonMatch = aiContent.match(/```json\s*([\s\S]*?)\s*```/) ||
                      aiContent.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error('No JSON in response');
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0];

    // Clean up common JSON issues
    const cleanedJson = jsonStr
      .replace(/\n/g, ' ')  // Remove newlines within strings
      .replace(/\r/g, '')    // Remove carriage returns
      .replace(/\t/g, ' ')   // Replace tabs with spaces
      .trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleanedJson);
    } catch (error: any) {
      throw new Error(`JSON parse failed: ${error.message}`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('AI answer is not a JSON object');
    }

    const recommendation = this.validateRecommendation(parsed.recommendation, expense.net_amount);

    // No years for an immediate deduction. For 'partial', fall back to the
    // useful life of the category when the model gave none (or nonsense) —
    // and compute the deduction with the years actually used.
    let suggestedYears: number | null = null;
    if (recommendation === 'partial') {
      const aiYears = Number(parsed.suggested_years);
      suggestedYears =
        Number.isFinite(aiYears) && aiYears >= 1 && aiYears <= 50
          ? Math.round(aiYears)
          : this.getUsefulLife({
              description: expense.description,
              category: parsed.suggested_category || expense.category,
            }).years;
    }

    const taxDeductible = this.calculateTaxDeductibleAmount(
      expense.net_amount,
      recommendation,
      suggestedYears ?? undefined,
      expense.expense_date
    );

    return {
      recommendation,
      reasoning: parsed.reasoning || 'AI analysis completed',
      suggested_years: suggestedYears,
      useful_life_category: parsed.useful_life_category,
      suggested_category: parsed.suggested_category || expense.category, // Default to current category
      category_reasoning: parsed.category_reasoning || 'Category kept as entered',
      tax_deductible_amount: taxDeductible,
      tax_deductible_percentage: this.validatePercentage(parsed.tax_deductible_percentage),
      tax_deductibility_reasoning: parsed.tax_deductibility_reasoning || 'Vollständig abzugsfähig als betriebliche Ausgabe.',
      references: Array.isArray(parsed.references) ? parsed.references : this.getReferences(recommendation),
      sources: this.filterSources(parsed.sources, offeredSources),
      confidence: this.validateConfidence(parsed.confidence),
      gwg_applicable: expense.net_amount <= GWG_LIMIT_NET,
      requires_depreciation: recommendation === 'partial',
      source: 'ai',
    };
  }

  /**
   * Keep only sources the model was actually offered — a model without web
   * access otherwise happily invents plausible-looking URLs.
   */
  private filterSources(
    sources: unknown,
    offered: Array<{ title: string; url: string }>
  ): Array<{ title: string; url: string }> {
    if (!Array.isArray(sources)) return [];
    const offeredUrls = new Set(offered.map((s) => s.url));
    return sources
      .filter((s: any) => s && typeof s.url === 'string' && offeredUrls.has(s.url))
      .map((s: any) => ({
        title: typeof s.title === 'string' && s.title ? s.title : s.url,
        url: s.url,
      }));
  }

  /** 0-100; 0 % (a private expense) is valid. Missing or out of range → 100. */
  private validatePercentage(value: unknown): number {
    if (value === null || value === undefined || value === '') return 100;
    const pct = typeof value === 'string' ? Number(value.replace('%', '').trim()) : Number(value);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return 100;
    return pct;
  }

  /** 0-1 (a 0-100 percentage is scaled down); 0 is valid. Missing or out of range → 0.8. */
  private validateConfidence(value: unknown): number {
    if (value === null || value === undefined || value === '') return 0.8;
    let confidence = Number(value);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) return 0.8;
    if (confidence > 1) confidence = confidence / 100;
    return confidence;
  }

  private validateRecommendation(rec: string, netAmount: number): 'none' | 'immediate' | 'partial' {
    // Trust the AI's recommendation - it has context we don't have
    // The AI knows whether something is an asset (requires depreciation) or
    // an operating expense (immediate deduction regardless of amount)
    if (['none', 'immediate', 'partial'].includes(rec)) {
      return rec as 'none' | 'immediate' | 'partial';
    }

    // Fallback only if the AI returns an invalid recommendation: GWG limit
    return netAmount > GWG_LIMIT_NET ? 'partial' : 'immediate';
  }

  /**
   * First-year deduction (§ 7 Abs. 1 Satz 4 EStG: pro rata by month, the
   * purchase month counts). One-year assets (IT since 2021) are deducted in
   * full in the purchase year.
   */
  private calculateTaxDeductibleAmount(
    netAmount: number,
    recommendation: string,
    years?: number,
    purchaseDate?: string
  ): number {
    if (recommendation === 'immediate') return netAmount;
    if (recommendation === 'partial' && years) {
      if (years === 1) {
        return netAmount;
      }

      const annual = netAmount / years;
      if (purchaseDate) {
        const monthsOwned = 13 - purchaseMonthOf(purchaseDate);
        return roundCents((annual * monthsOwned) / 12);
      }
      return roundCents(annual);
    }
    return 0;
  }

  /**
   * Useful life for an asset: the app category first, then AfA table keywords
   * in the category or description, then the generic default.
   */
  private getUsefulLife(expense: { category?: string; description?: string }): {
    years: number;
    known: boolean;
  } {
    const category = (expense.category || '').toLowerCase().trim();
    if (CATEGORY_USEFUL_LIFE[category] !== undefined) {
      return { years: CATEGORY_USEFUL_LIFE[category], known: true };
    }

    const categoryKey = category.replace(/[^a-z]/g, '_');
    if (AfA_TABLE[categoryKey] !== undefined) {
      return { years: AfA_TABLE[categoryKey], known: true };
    }

    const description = (expense.description || '').toLowerCase();
    for (const [keyword, years] of Object.entries(AfA_TABLE)) {
      const pattern = keyword.replace(/_/g, '[ _-]?');
      if (new RegExp(`(^|[^a-zäöüß])${pattern}($|[^a-zäöüß])`).test(description)) {
        return { years, known: true };
      }
    }

    return { years: DEFAULT_USEFUL_LIFE_YEARS, known: false };
  }

  private getReferences(recommendation: string): string[] {
    if (recommendation === 'immediate') return ['§ 6 Abs. 2 EStG'];
    if (recommendation === 'partial') return ['§ 7 Abs. 1 EStG', 'BMF AfA-Tabellen'];
    return [];
  }

  /**
   * Rules-based analysis — used when the AI is disabled or failed. Always
   * marked `source: 'rules'` with the reason, and given a deliberately modest
   * confidence: it only knows the amount, the category and the date.
   */
  basicDepreciationRules(
    expense: ExpenseForAnalysis,
    aiErrorCode?: AIDepreciationErrorCode
  ): DepreciationAnalysis {
    const netAmount = expense.net_amount;
    const category = (expense.category || '').toLowerCase().trim();

    const common = {
      suggested_category: expense.category, // Keep current category
      category_reasoning: 'Category kept as entered (rules-based analysis)',
      tax_deductible_percentage: 100,
      tax_deductibility_reasoning:
        'Regelbasierte Annahme: vollständig abzugsfähig als betriebliche Ausgabe. Bei gemischter Nutzung nur der betriebliche Anteil.',
      sources: [] as Array<{ title: string; url: string }>,
      source: 'rules' as const,
      ...(aiErrorCode ? { ai_error_code: aiErrorCode } : {}),
    };

    if (OPERATING_EXPENSE_CATEGORIES.has(category)) {
      return {
        ...common,
        recommendation: 'immediate',
        reasoning: 'Laufende Betriebsausgabe (kein Wirtschaftsgut des Anlagevermögens): im Jahr der Zahlung voll abziehbar.',
        suggested_years: null,
        tax_deductible_amount: netAmount,
        confidence: 0.6,
        references: ['§ 4 Abs. 4 EStG'],
        gwg_applicable: false,
        requires_depreciation: false,
      };
    }

    if (netAmount <= SMALL_ASSET_LIMIT_NET) {
      return {
        ...common,
        recommendation: 'immediate',
        reasoning: 'Bis 250 € netto: sofort als Betriebsausgabe abziehbar.',
        suggested_years: null,
        tax_deductible_amount: netAmount,
        confidence: 0.6,
        references: ['§ 6 Abs. 2 EStG'],
        gwg_applicable: true,
        requires_depreciation: false,
      };
    }

    if (netAmount <= GWG_LIMIT_NET) {
      return {
        ...common,
        recommendation: 'immediate',
        reasoning:
          'Geringwertiges Wirtschaftsgut (bis 800 € netto): Sofortabschreibung nach § 6 Abs. 2 EStG. ' +
          'Alternativ Sammelposten nach § 6 Abs. 2a EStG (5 Jahre zu je 20 %).',
        suggested_years: null,
        tax_deductible_amount: netAmount,
        confidence: 0.6,
        references: ['§ 6 Abs. 2 EStG', '§ 6 Abs. 2a EStG'],
        gwg_applicable: true,
        requires_depreciation: false,
      };
    }

    // Above the GWG limit: regular AfA over the useful life of the asset.
    const { years, known } = this.getUsefulLife(expense);
    const monthsOwned = 13 - purchaseMonthOf(expense.expense_date);
    const firstYear = this.calculateTaxDeductibleAmount(netAmount, 'partial', years, expense.expense_date);

    const lifeText =
      years === 1
        ? 'Nutzungsdauer 1 Jahr (Computerhardware/Software, BMF-Schreiben vom 22.02.2022): voller Abzug im Anschaffungsjahr.'
        : `Lineare AfA über ${years} Jahre${known ? '' : ' (Annahme — Nutzungsdauer laut AfA-Tabelle prüfen)'}, ` +
          `im ersten Jahr ${monthsOwned}/12 (§ 7 Abs. 1 EStG).`;

    const reasoning =
      netAmount <= POOL_LIMIT_NET
        ? 'Über der GWG-Grenze von 800 € netto: keine Sofortabschreibung. ' +
          'Wahlweise Sammelposten nach § 6 Abs. 2a EStG (5 Jahre zu je 20 %) oder reguläre AfA. ' +
          lifeText
        : `Über 1.000 € netto: abschreibungspflichtig. ${lifeText}`;

    return {
      ...common,
      recommendation: 'partial',
      reasoning,
      suggested_years: years,
      useful_life_category: category || 'other',
      tax_deductible_amount: firstYear,
      confidence: known ? 0.5 : 0.3,
      references:
        netAmount <= POOL_LIMIT_NET
          ? ['§ 7 Abs. 1 EStG', '§ 6 Abs. 2a EStG', 'BMF AfA-Tabellen']
          : ['§ 7 Abs. 1 EStG', 'BMF AfA-Tabellen'],
      gwg_applicable: false,
      requires_depreciation: true,
    };
  }
}
