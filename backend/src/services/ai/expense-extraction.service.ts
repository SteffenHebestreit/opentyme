/**
 * @fileoverview AI-powered Expense Data Extraction Service
 * 
 * Uses OpenAI-compatible APIs (LM Studio, OpenAI, etc.) to extract structured
 * expense data from PDF receipt text extracted by MCP server.
 */

import axios, { AxiosInstance } from 'axios';
import { logger } from '../../utils/logger';
import { getDbClient } from '../../utils/database';
import { classifyUpstreamError } from '../../utils/upstream-error';
import {
  DocumentConverterClient,
  DocumentConversionError,
  DEFAULT_DOCUMENT_CONVERTER_URL,
} from './mcp-client.service';

/**
 * Stable error codes of the receipt analysis (API contract: the frontend
 * translates them; see expense-receipt.controller.ts for the HTTP mapping).
 */
export type ReceiptAnalysisErrorCode =
  /** The document converted fine but holds no readable text. */
  | 'NO_TEXT'
  /** The document converter or the AI server could not be reached. */
  | 'AI_UNREACHABLE'
  /** The document converter or the AI server did not answer in time. */
  | 'AI_TIMEOUT'
  /** The AI server rejected the configured API key (401/403). */
  | 'AI_AUTH'
  /** The AI server answered, but not with a usable extraction. */
  | 'AI_INVALID_RESPONSE'
  /** The document converter answered with an error. */
  | 'EXTRACTION_FAILED';

export class ReceiptAnalysisError extends Error {
  readonly code: ReceiptAnalysisErrorCode;
  /** Which upstream failed — lets the client say what to check. */
  readonly service: 'converter' | 'llm';

  constructor(code: ReceiptAnalysisErrorCode, service: 'converter' | 'llm', message: string) {
    super(message);
    this.name = 'ReceiptAnalysisError';
    this.code = code;
    this.service = service;
  }
}

/**
 * Extracted expense data structure
 */
/**
 * A single position on an invoice.
 *
 * Invoices routinely bundle articles that must be booked separately: the GWG
 * threshold of §6 Abs. 2 EStG applies per Wirtschaftsgut, not per invoice, and
 * the AfA useful life differs per article type. Extracting the positions lets
 * the Add Expense modal offer one expense per article instead of collapsing a
 * mixed invoice into one fictitious asset.
 */
export interface ExtractedLineItem {
  /** What this position is — same rules as ExtractedExpenseData.description. */
  description: string;
  /** Number of units on this position, 1 when the invoice does not say. */
  quantity?: number;
  /** Gross price of a single unit, when the invoice states one. */
  unit_amount?: number;
  /** Gross total for this position (unit_amount x quantity). */
  amount: number;
  /** Expense category for this position specifically. */
  category?: string;
  tax_rate?: number;
}

export interface ExtractedExpenseData {
  amount?: number;
  currency?: string;
  date?: string;
  vendor?: string;
  /** Third-party seller on marketplace invoices ("Verkauft von" / "Sold by"). */
  seller?: string;
  invoice_number?: string;
  category?: string;
  /** What was bought — the line shown in the expense overview, never a company name. */
  description?: string;
  tax_amount?: number;
  tax_rate?: number;
  /**
   * The invoice's individual positions. Present with 2+ entries only when the
   * invoice really bundles distinct articles — a single-article invoice returns
   * an empty array so the caller can keep the simple one-expense path.
   */
  line_items?: ExtractedLineItem[];
  confidence?: number;
  raw_text?: string;
}

/**
 * The expense categories the app actually accepts. Must stay in sync with
 * ExpenseCategory in frontend/src/api/types.ts and the category options in
 * AddExpenseModal. The model is constrained to these via a JSON schema enum,
 * and the result is re-checked against this list before it is returned.
 */
const EXPENSE_CATEGORIES = [
  'computer', 'software', 'peripherals', 'storage', 'display', 'printer',
  'office_furniture', 'office_equipment', 'office_supplies',
  'vehicle_car', 'vehicle_motorcycle',
  'camera', 'tools', 'machinery',
  'insurance', 'professional_services', 'marketing', 'utilities', 'travel',
  'meals', 'training', 'rent', 'telecommunications',
  'other',
] as const;

/**
 * JSON schema handed to the model via response_format. Every field is required
 * (nullable where optional) because a strict schema otherwise lets the model
 * silently drop fields.
 */
const EXTRACTION_JSON_SCHEMA = {
  name: 'expense_extraction',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      description: { type: 'string' },
      vendor: { type: 'string' },
      seller: { type: ['string', 'null'] },
      invoice_number: { type: ['string', 'null'] },
      amount: { type: 'number' },
      currency: { type: 'string' },
      date: { type: 'string' },
      tax_amount: { type: ['number', 'null'] },
      tax_rate: { type: ['number', 'null'] },
      category: { type: 'string', enum: [...EXPENSE_CATEGORIES] },
      line_items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            quantity: { type: 'number' },
            unit_amount: { type: 'number' },
            amount: { type: 'number' },
            tax_rate: { type: ['number', 'null'] },
            category: { type: 'string', enum: [...EXPENSE_CATEGORIES] },
          },
          required: ['description', 'quantity', 'unit_amount', 'amount', 'tax_rate', 'category'],
          additionalProperties: false,
        },
      },
    },
    required: [
      'description', 'vendor', 'seller', 'invoice_number', 'amount',
      'currency', 'date', 'tax_amount', 'tax_rate', 'category', 'line_items',
    ],
    additionalProperties: false,
  },
} as const;

/**
 * AI Expense Extraction Service
 * Works with any OpenAI-compatible API (LM Studio, OpenAI, Azure OpenAI, etc.)
 */
export class ExpenseExtractionService {
  private client: AxiosInstance | null = null;
  private converter: DocumentConverterClient | null = null;
  private apiUrl: string | undefined = undefined;
  private apiKey: string | null = null;
  private model: string = 'llama-3.2-3b-instruct';
  private enabled: boolean = false;

  /**
   * Load the user's settings and set up the clients.
   *
   * The document converter is always set up — with AI disabled the receipt
   * endpoint still returns the raw extracted text. The LLM client is only
   * created when AI is enabled.
   */
  async initialize(userId: string): Promise<void> {
    let settings: any = null;
    try {
      settings = await this.getUserSettings(userId);
    } catch (error: any) {
      logger.error('Failed to load AI extraction settings:', error.message);
    }

    const converterUrl =
      settings?.mcp_server_url || process.env.MCP_SERVER_URL || DEFAULT_DOCUMENT_CONVERTER_URL;
    this.converter = new DocumentConverterClient(converterUrl);

    if (!settings || !settings.ai_enabled) {
      logger.info('AI extraction is disabled in settings');
      this.enabled = false;
      this.client = null;
      return;
    }

    this.enabled = true;
    this.apiUrl = settings.ai_api_url || 'http://localhost:1234/v1';
    this.apiKey = settings.ai_api_key || '';
    this.model = settings.ai_model || 'qwen/qwen3-v1-30b';

    // Create axios client for OpenAI-compatible API
    this.client = axios.create({
      baseURL: this.apiUrl,
      timeout: 180000, // 3 minutes — large local models can be slow
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
      },
    });

    logger.info(`AI extraction initialized (model: ${this.model})`);
  }

  /**
   * Get user settings from database
   */
  private async getUserSettings(userId: string): Promise<any> {
    const pool = getDbClient();
    const result = await pool.query(
      `SELECT 
        ai_enabled,
        ai_provider,
        ai_api_url,
        ai_api_key,
        ai_model,
        mcp_server_url
      FROM settings 
      WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      logger.warn(`No settings found for user ${userId}, using defaults`);
      return {
        ai_enabled: false,
        ai_api_url: 'http://localhost:1234/v1',
        ai_api_key: '',
        ai_model: 'qwen/qwen3-v1-30b',
        mcp_server_url: DEFAULT_DOCUMENT_CONVERTER_URL,
      };
    }

    return result.rows[0];
  }

  /**
   * Check if AI extraction is enabled and initialized
   */
  isEnabled(): boolean {
    return this.enabled && this.client !== null;
  }

  /**
   * Extract text from a receipt document using the document converter.
   *
   * Handles PDFs and images alike — markitdown describes photographed and
   * scanned receipts through its LLM, so a phone snapshot of a till slip goes
   * down the same path as a PDF invoice.
   *
   * @param fileBuffer - Receipt file buffer (PDF or image)
   * @param filename - Original filename; its extension tells the converter
   *                   which converter to use, so pass the real one
   * @param contentType - MIME type of the upload
   * @returns Extracted text (never empty)
   * @throws ReceiptAnalysisError
   */
  async extractDocumentText(
    fileBuffer: Buffer,
    filename: string,
    contentType?: string
  ): Promise<string> {
    if (!this.converter) {
      throw new Error('ExpenseExtractionService.initialize() has not been called');
    }

    try {
      return await this.converter.extractDocumentText(fileBuffer, filename, contentType);
    } catch (error) {
      if (error instanceof DocumentConversionError) {
        switch (error.code) {
          case 'NO_TEXT':
            throw new ReceiptAnalysisError('NO_TEXT', 'converter', 'The document contains no readable text');
          case 'UNREACHABLE':
            throw new ReceiptAnalysisError('AI_UNREACHABLE', 'converter', 'The document converter is unreachable');
          case 'TIMEOUT':
            throw new ReceiptAnalysisError('AI_TIMEOUT', 'converter', 'The document converter timed out');
          default:
            throw new ReceiptAnalysisError('EXTRACTION_FAILED', 'converter', 'The document could not be converted');
        }
      }
      throw error;
    }
  }

  /**
   * Extract expense data from text using AI
   * 
   * @param text - Extracted text from PDF receipt
   * @returns Structured expense data
   * @throws ReceiptAnalysisError for upstream failures
   */
  async extractExpenseData(text: string): Promise<ExtractedExpenseData> {
    if (!this.isEnabled()) {
      throw new Error('AI extraction is not enabled or initialized');
    }

    logger.info(`Extracting expense data from ${text.length} characters of text`);

    const prompt = this.buildExtractionPrompt(text);

    let parsed: any;
    try {
      const completion = await this.requestCompletion(prompt);
      // Robustly extract JSON — strip <think> blocks, markdown fences, and any leading/trailing text
      const jsonString = this.extractJsonFromResponse(completion);
      parsed = JSON.parse(jsonString);
    } catch (error: any) {
      throw this.toReceiptAnalysisError(error);
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      logger.error('AI extraction returned JSON that is not an object');
      throw new ReceiptAnalysisError('AI_INVALID_RESPONSE', 'llm', 'The AI answer was not a JSON object');
    }

    const extractedData = this.normalizeExtractedData(parsed);

    // Add confidence score and raw text
    const result: ExtractedExpenseData = {
      ...extractedData,
      confidence: this.calculateConfidence(extractedData),
      raw_text: text.substring(0, 500), // Store first 500 chars for reference
    };

    // Field presence only — the values are the user's receipt contents.
    logger.info(
      `Extracted expense data: confidence=${result.confidence}, fields=[${Object.keys(result)
        .filter((k) => k !== 'raw_text' && (result as any)[k] !== undefined)
        .join(', ')}], line_items=${result.line_items?.length ?? 0}`
    );
    return result;
  }

  /**
   * Map anything thrown while talking to the model to a ReceiptAnalysisError.
   */
  private toReceiptAnalysisError(error: any): Error {
    if (error instanceof ReceiptAnalysisError) return error;

    if (error instanceof SyntaxError) {
      logger.error(`AI extraction answer is not valid JSON: ${error.message}`);
      return new ReceiptAnalysisError('AI_INVALID_RESPONSE', 'llm', 'The AI answer was not valid JSON');
    }

    const failure = classifyUpstreamError(error);
    logger.error(
      `AI extraction request failed (${failure.kind}${failure.status ? `, HTTP ${failure.status}` : ''}${
        failure.code ? `, ${failure.code}` : ''
      }): ${error?.message}`
    );
    switch (failure.kind) {
      case 'unreachable':
        return new ReceiptAnalysisError('AI_UNREACHABLE', 'llm', 'The AI server is unreachable');
      case 'timeout':
        return new ReceiptAnalysisError('AI_TIMEOUT', 'llm', 'The AI server timed out');
      case 'auth':
        return new ReceiptAnalysisError('AI_AUTH', 'llm', 'The AI server rejected the API key');
      case 'http':
        return new ReceiptAnalysisError(
          'AI_INVALID_RESPONSE',
          'llm',
          `The AI server answered HTTP ${failure.status}`
        );
      default:
        return error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Ask the model for the extraction, constraining it to EXTRACTION_JSON_SCHEMA.
   *
   * Servers that speak the OpenAI structured-output dialect (LM Studio, OpenAI,
   * vLLM, …) then cannot return anything but a conforming object, which is what
   * keeps `description` and `vendor` from swapping places. Servers that reject
   * `response_format` are retried once without it, falling back to the
   * prose-scraping path in extractJsonFromResponse().
   *
   * @returns The raw completion text (already JSON when the schema was accepted)
   */
  private async requestCompletion(prompt: string): Promise<string> {
    const basePayload = {
      model: this.model,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert at extracting structured bookkeeping data from receipts and invoices. Return a single JSON object and nothing else.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      // Reasoning models (Qwen3, gpt-oss, …) spend most of this budget on
      // hidden reasoning before emitting a single token of answer — an ordinary
      // one-page invoice was measured at ~2.3k reasoning tokens, so a 4k cap
      // truncated longer documents mid-thought and yielded an empty `content`.
      max_tokens: 12000,
    };

    let response;
    try {
      response = await this.client!.post('/chat/completions', {
        ...basePayload,
        response_format: { type: 'json_schema', json_schema: EXTRACTION_JSON_SCHEMA },
      });
    } catch (error: any) {
      if (error.response?.status !== 400) throw error;
      logger.warn(
        `AI endpoint rejected response_format json_schema, retrying unconstrained: ${JSON.stringify(
          error.response?.data
        )?.substring(0, 300)}`
      );
      response = await this.client!.post('/chat/completions', basePayload);
    }

    const choice = response.data?.choices?.[0];
    if (!choice) {
      logger.error('AI response contained no choices');
      throw new ReceiptAnalysisError('AI_INVALID_RESPONSE', 'llm', 'The AI answer contained no choices');
    }

    // Reasoning models split their output: hidden reasoning goes to
    // reasoning_content, the answer to content. The reasoning is never the
    // answer — an empty content means the model produced no answer.
    const completion = this.messageText(choice.message?.content);

    if (!completion.trim()) {
      if (choice.finish_reason === 'length') {
        logger.error('AI model exhausted its token budget before answering (finish_reason=length)');
        throw new ReceiptAnalysisError(
          'AI_INVALID_RESPONSE',
          'llm',
          'The AI model used up its token budget before answering'
        );
      }
      logger.error(`AI model returned an empty answer (finish_reason=${choice.finish_reason})`);
      throw new ReceiptAnalysisError('AI_INVALID_RESPONSE', 'llm', 'The AI model returned an empty answer');
    }

    logger.info(
      `AI response: ${completion.length} chars (finish_reason=${choice.finish_reason})`
    );
    return completion;
  }

  /**
   * Message content is a string on every OpenAI-compatible server we know, but
   * the spec also allows an array of content parts.
   */
  private messageText(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
        .join('');
    }
    return '';
  }

  /**
   * Coerce the model's output into the shapes the expense form expects.
   *
   * Guards the two things a free-form model reliably gets wrong even under a
   * schema: German number/date formatting, and a category outside the app's
   * enum (which the form's select would silently refuse to display).
   */
  private normalizeExtractedData(raw: any): ExtractedExpenseData {
    const data: ExtractedExpenseData = { ...raw };

    data.amount = this.toNumber(raw.amount);
    data.tax_amount = this.toNumber(raw.tax_amount);
    data.tax_rate = this.toTaxRate(raw.tax_rate);

    data.date = this.toIsoDate(raw.date);

    if (!data.category || !(EXPENSE_CATEGORIES as readonly string[]).includes(data.category)) {
      if (data.category) {
        logger.warn(`AI returned unknown expense category "${data.category}", dropping it`);
      }
      delete data.category;
    }

    data.line_items = this.normalizeLineItems(raw.line_items, data.category);

    for (const key of ['description', 'vendor', 'seller', 'invoice_number', 'currency'] as const) {
      const value = (data as any)[key];
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) {
          (data as any)[key] = trimmed;
        } else {
          delete (data as any)[key];
        }
      } else if (value === null) {
        delete (data as any)[key];
      }
    }

    return data;
  }

  /**
   * Clean up the extracted invoice positions.
   *
   * Drops anything without a usable description and amount (zero-value shipping
   * rows, hallucinated placeholders), and falls back to the invoice-level
   * category when a position's own category is not one the app accepts.
   * Returns an empty array for single-article invoices so callers can keep the
   * plain one-expense path.
   */
  private normalizeLineItems(raw: any, fallbackCategory?: string): ExtractedLineItem[] {
    if (!Array.isArray(raw)) return [];

    const items = raw
      .map((entry: any): ExtractedLineItem | null => {
        const description = typeof entry?.description === 'string' ? entry.description.trim() : '';
        const amount = this.toNumber(entry?.amount);
        if (!description || amount === undefined || amount <= 0) return null;

        const quantity = this.toNumber(entry?.quantity);
        const unitAmount = this.toNumber(entry?.unit_amount);
        const taxRate = this.toTaxRate(entry?.tax_rate);

        const category =
          typeof entry?.category === 'string' &&
          (EXPENSE_CATEGORIES as readonly string[]).includes(entry.category)
            ? entry.category
            : fallbackCategory;

        return {
          description,
          quantity: quantity && quantity > 0 ? quantity : 1,
          unit_amount: unitAmount,
          amount,
          category,
          tax_rate: taxRate,
        };
      })
      .filter((item): item is ExtractedLineItem => item !== null);

    // A single position carries no more information than the invoice itself.
    return items.length > 1 ? items : [];
  }

  /**
   * Parse a number that may arrive as a formatted string.
   *
   * German invoices swap the separators: "1.234,56 €" is 1234.56, and a lone
   * dot followed by exactly three digits ("1.234") is a thousands separator.
   * English formatting ("1,234.56") is accepted as well.
   */
  private toNumber(value: any): number | undefined {
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value !== 'string') return undefined;

    let cleaned = value.replace(/[^\d.,-]/g, '');
    if (!cleaned || !/\d/.test(cleaned)) return undefined;

    const negative = cleaned.startsWith('-');
    cleaned = cleaned.replace(/-/g, '');

    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');

    if (lastComma !== -1 && lastDot !== -1) {
      // Both separators: whichever comes last is the decimal separator.
      cleaned =
        lastComma > lastDot
          ? cleaned.replace(/\./g, '').replace(',', '.')
          : cleaned.replace(/,/g, '');
    } else if (lastComma !== -1) {
      // Only commas: "1,234" / "1,234,567" group thousands, "51,99" is a decimal.
      cleaned = /^[1-9]\d{0,2}(,\d{3})+$/.test(cleaned)
        ? cleaned.replace(/,/g, '')
        : cleaned.split(',').length === 2
          ? cleaned.replace(',', '.')
          : '';
    } else if (lastDot !== -1) {
      // Only dots: "1.234" / "1.234.567" group thousands, "12.50" is a decimal.
      if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(cleaned)) {
        cleaned = cleaned.replace(/\./g, '');
      } else if (cleaned.split('.').length > 2) {
        cleaned = '';
      }
    }

    if (!/^\d*\.?\d+$|^\d+\.$/.test(cleaned)) return undefined;
    const parsed = parseFloat(cleaned);
    if (!Number.isFinite(parsed)) return undefined;
    return negative ? -parsed : parsed;
  }

  /**
   * Normalise a VAT rate to a decimal fraction in [0, 1).
   *
   * The model is asked for 0.19 but sometimes answers 19 (or "19 %"); 0 is a
   * valid rate (tax-exempt / reverse charge) and is kept.
   */
  private toTaxRate(value: any): number | undefined {
    let rate = this.toNumber(value);
    if (rate === undefined) return undefined;
    // A percentage slipped through as 19 instead of 0.19
    if (rate > 1) rate = rate / 100;
    if (rate < 0 || rate >= 1) {
      logger.warn(`AI returned an implausible tax rate, dropping it`);
      return undefined;
    }
    return Math.round(rate * 10000) / 10000;
  }

  /**
   * Normalise a date to YYYY-MM-DD, accepting the DD.MM.YYYY and DD/MM/YYYY
   * forms that German and European invoices use. Impossible calendar dates
   * (2026-02-30) are dropped rather than rolled over into the next month.
   */
  private toIsoDate(value: any): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;

    let year: number | undefined;
    let month: number | undefined;
    let day: number | undefined;

    const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
    const euro = trimmed.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
    if (iso) {
      [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    } else if (euro) {
      [day, month, year] = [Number(euro[1]), Number(euro[2]), Number(euro[3])];
    }

    if (year === undefined || month === undefined || day === undefined) {
      logger.warn('AI returned an unparseable date, dropping it');
      return undefined;
    }

    const candidate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (!this.isValidDate(candidate)) {
      logger.warn('AI returned an impossible calendar date, dropping it');
      return undefined;
    }
    return candidate;
  }

  /**
   * Robustly extract a JSON object from an AI response.
   * Handles: <think>...</think> blocks (also unclosed ones and a dangling
   * </think> whose opening tag was part of the chat template), ```json fences,
   * leading prose.
   */
  private extractJsonFromResponse(raw: string): string {
    if (!raw || !raw.trim()) {
      throw new ReceiptAnalysisError('AI_INVALID_RESPONSE', 'llm', 'The AI model returned an empty answer');
    }

    let text = raw;

    // Strip complete <think>...</think> blocks (Qwen3 / chain-of-thought models)
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
    // A closing tag without its opening tag: everything before it is reasoning
    const lastClose = text.toLowerCase().lastIndexOf('</think>');
    if (lastClose !== -1) {
      text = text.slice(lastClose + '</think>'.length);
    }
    // An opening tag that was never closed: the rest is unfinished reasoning
    text = text.replace(/<think>[\s\S]*$/i, '').trim();

    // Strip markdown code fences
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

    // Find the first complete JSON object {…} or array […]
    const openBrace = text.indexOf('{');
    const openBracket = text.indexOf('[');
    const start = openBrace === -1 ? openBracket
                : openBracket === -1 ? openBrace
                : Math.min(openBrace, openBracket);

    if (start === -1) {
      logger.error(`No JSON found in AI response (${text.length} chars after cleanup)`);
      throw new ReceiptAnalysisError('AI_INVALID_RESPONSE', 'llm', 'The AI answer contained no JSON');
    }

    const closeChar = text[start] === '{' ? '}' : ']';
    const end = text.lastIndexOf(closeChar);

    if (end === -1 || end <= start) {
      logger.error(`Malformed JSON in AI response (${text.length} chars after cleanup)`);
      throw new ReceiptAnalysisError('AI_INVALID_RESPONSE', 'llm', 'The AI answer contained malformed JSON');
    }

    return text.substring(start, end + 1);
  }

  /**
   * Build extraction prompt for the AI model
   */
  private buildExtractionPrompt(text: string): string {
    return `You extract structured bookkeeping data from a receipt or invoice.

Return ONLY a JSON object with these fields:

- description: A short label (max 80 characters) saying WHAT WAS BOUGHT — the goods
  or the service itself. This is the single line shown in the user's expense
  overview, so it has to be meaningful on its own.
  * Take it from the line item / product / service description.
  * NEVER put a company name here — not the merchant, not the marketplace, and not
    the third-party seller. Those belong in "vendor" and "seller".
  * Strip marketing filler, compatibility lists, colour variants and article
    numbers (ASIN, SKU, EAN). Keep the brand and the essential product type,
    e.g. "ProtoArc XK01 Bluetooth-Tastatur", not the full 200-character listing title.
  * With several line items, summarise them, e.g. "Büromaterial: Toner, Papier, Ordner".
  * Write it in the language of the invoice.
- vendor: The company the money was paid to — the merchant, marketplace or issuer
  of the invoice. On a marketplace invoice this is the marketplace (e.g. Amazon),
  not the third-party seller.
- seller: The third-party seller when the invoice names one separately
  ("Verkauft von" / "Sold by"). null when it is the same as vendor.
- invoice_number: The invoice or receipt number ("Rechnungsnummer"), else null.
- amount: The total gross amount actually paid, as a number with . as the decimal
  separator. German invoices use the opposite convention, so read carefully:
  "51,99 €" is 51.99 and "1.234,56 €" is 1234.56. Take the final total
  ("Gesamtpreis" / "Zahlbetrag" / "Total"), not a line-item subtotal.
- currency: ISO 4217 code, e.g. "EUR", "USD".
- date: The invoice date ("Rechnungsdatum") as YYYY-MM-DD. German dates are
  DD.MM.YYYY, so 02.03.2026 is 2026-03-02 — not 2026-02-03.
- tax_amount: The VAT amount ("USt." / "MwSt.") as a number, else null.
- tax_rate: The VAT rate as a decimal — 19% is 0.19, not 19 — else null.
- category: EXACTLY ONE of these values, nothing else:
  ${EXPENSE_CATEGORIES.join(', ')}
  Pick the most specific fit:
  * keyboards, mice, headsets, webcams, docking stations, cables -> peripherals
  * laptops, tablets, desktop PCs, servers -> computer
  * monitors, projectors -> display
  * external drives, USB sticks, SD cards -> storage
  * licences, subscriptions, SaaS, hosting -> software
  Use "other" only when genuinely nothing fits.
- line_items: The invoice's individual positions, as an array.
  This matters for tax: the 800 EUR GWG limit applies per article, not per
  invoice, and different article types have different depreciation periods, so a
  mixed invoice has to be bookable as separate expenses.
  * Return one entry per position of the invoice, each with:
    - description: what that position is, same rules as above (no company names,
      no article numbers, keep brand + product type)
    - quantity: number of units on that position (1 when not stated)
    - unit_amount: gross price of ONE unit
    - amount: gross total for that position (unit_amount x quantity)
    - tax_rate: that position's VAT rate as a decimal, else null
    - category: the category for THAT position, from the list above
  * Use gross (inkl. USt.) prices. If the invoice lists only net prices, apply
    that position's VAT rate to get the gross value.
  * Ignore zero-value positions such as "Versandkosten 0,00 EUR".
  * The position totals must add up to "amount" above. Re-check before answering.
  * Return an EMPTY array when the invoice covers only a single article — the
    caller then just books the one expense.

The top-level "description", "amount" and "category" always describe the invoice
as a whole, even when line_items is populated.

Receipt text:
${text}

Return the JSON object and nothing else — no explanation, no markdown fences.`;
  }

  /**
   * Calculate confidence score based on extracted data completeness
   */
  private calculateConfidence(data: Partial<ExtractedExpenseData>): number {
    let score = 0;
    const weights = {
      amount: 30,
      date: 25,
      vendor: 20,
      category: 15,
      currency: 10,
    };

    if (data.amount && data.amount > 0) score += weights.amount;
    if (data.date && this.isValidDate(data.date)) score += weights.date;
    if (data.vendor && data.vendor.length > 0) score += weights.vendor;
    if (data.category && data.category.length > 0) score += weights.category;
    if (data.currency && data.currency.length > 0) score += weights.currency;

    return Math.min(score, 100);
  }

  /**
   * Validate a YYYY-MM-DD date, including the calendar (no 2026-02-30).
   */
  private isValidDate(dateString: string): boolean {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
    if (!match) return false;

    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (year < 1900 || year > 2999 || month < 1 || month > 12 || day < 1) return false;
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }
}
