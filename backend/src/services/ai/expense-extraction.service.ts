/**
 * @fileoverview AI-powered Expense Data Extraction Service
 * 
 * Uses OpenAI-compatible APIs (LM Studio, OpenAI, etc.) to extract structured
 * expense data from PDF receipt text extracted by MCP server.
 */

import axios, { AxiosInstance } from 'axios';
import { logger } from '../../utils/logger';
import { getDbClient } from '../../utils/database';
import { MCPClientService } from './mcp-client.service';

/**
 * Extracted expense data structure
 */
export interface ExtractedExpenseData {
  amount?: number;
  currency?: string;
  date?: string;
  vendor?: string;
  category?: string;
  description?: string;
  tax_amount?: number;
  tax_rate?: number;
  confidence?: number;
  raw_text?: string;
}

/**
 * AI Expense Extraction Service
 * Works with any OpenAI-compatible API (LM Studio, OpenAI, Azure OpenAI, etc.)
 */
export class ExpenseExtractionService {
  private client: AxiosInstance | null = null;
  private mcpClient: MCPClientService | null = null;
  private apiUrl: string | undefined = undefined;
  private apiKey: string | null = null;
  private model: string = 'llama-3.2-3b-instruct';
  private enabled: boolean = false;

  /**
   * Initialize the AI service with settings from database
   */
  async initialize(userId: string): Promise<void> {
    try {
      // Fetch user settings
      const settings = await this.getUserSettings(userId);

      if (!settings || !settings.ai_enabled) {
        logger.info('AI extraction is disabled in settings');
        this.enabled = false;
        return;
      }

      this.enabled = true;
      this.apiUrl = settings.ai_api_url || 'http://localhost:1234/v1';
      this.apiKey = settings.ai_api_key || '';
      this.model = settings.ai_model || 'qwen/qwen3-v1-30b';

      // Initialize MCP client with user's server URL
      const mcpServerUrl = settings.mcp_server_url || 'http://mcp-server:8000';
      this.mcpClient = new MCPClientService(mcpServerUrl);
      logger.info(`MCP client initialized with URL: ${mcpServerUrl}`);

      // Create axios client for OpenAI-compatible API
      this.client = axios.create({
        baseURL: this.apiUrl,
        timeout: 60000, // 60 seconds
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
        },
      });

      logger.info(`AI extraction initialized: ${this.apiUrl} (model: ${this.model})`);
    } catch (error: any) {
      logger.error('Failed to initialize AI extraction service:', error.message);
      this.enabled = false;
    }
  }

  /**
   * Get user settings from database
   */
  private async getUserSettings(userId: string): Promise<any> {
    try {
      const pool = getDbClient();
      const result = await pool.query(
        `SELECT 
          ai_enabled,
          ai_provider,
          ai_api_url,
          ai_api_key,
          ai_model,
          mcp_server_url,
          mcp_server_api_key
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
          mcp_server_url: 'http://mcp-server:8000',
        };
      }

      return result.rows[0];
    } catch (error: any) {
      logger.error(`Failed to load settings for user ${userId}:`, error.message);
      throw error;
    }
  }

  /**
   * Check if AI extraction is enabled and initialized
   */
  isEnabled(): boolean {
    return this.enabled && this.client !== null;
  }

  /**
   * Extract text from PDF using MCP server
   * 
   * @param fileBuffer - PDF file buffer
   * @param filename - Original filename
   * @returns Extracted text
   */
  async extractPDFText(fileBuffer: Buffer, filename: string): Promise<string> {
    if (!this.mcpClient) {
      throw new Error('MCP client is not initialized');
    }

    return await this.mcpClient.extractPDFText(fileBuffer, filename);
  }

  /**
   * Extract expense data from text using AI
   * 
   * @param text - Extracted text from PDF receipt
   * @returns Structured expense data
   */
  async extractExpenseData(text: string): Promise<ExtractedExpenseData> {
    if (!this.isEnabled()) {
      throw new Error('AI extraction is not enabled or initialized');
    }

    try {
      logger.info(`Extracting expense data from ${text.length} characters of text`);

      // Create structured prompt for expense extraction
      const prompt = this.buildExtractionPrompt(text);

      // Call OpenAI-compatible API
      try {
        const response = await this.client!.post('/chat/completions', {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'You are an expert at extracting structured data from receipts and invoices. Extract information accurately and return it in JSON format.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.1, // Low temperature for consistent extraction
          max_tokens: 500,
          // response_format: { type: 'json_object' }, // Commented out - not all models/APIs support this
        });

        const completion = response.data.choices[0].message.content;
        logger.info('AI response:', completion);
        
        // Parse JSON response (handle markdown code blocks)
        let jsonString = completion.trim();
        
        // Remove markdown code blocks if present
        if (jsonString.startsWith('```json')) {
          jsonString = jsonString.replace(/^```json\n/, '').replace(/\n```$/, '');
        } else if (jsonString.startsWith('```')) {
          jsonString = jsonString.replace(/^```\n/, '').replace(/\n```$/, '');
        }
        
        const extractedData = JSON.parse(jsonString);

        // Add confidence score and raw text
        const result: ExtractedExpenseData = {
          ...extractedData,
          confidence: this.calculateConfidence(extractedData),
          raw_text: text.substring(0, 500), // Store first 500 chars for reference
        };

        logger.info('Successfully extracted expense data:', JSON.stringify(result, null, 2));
        return result;
      } catch (apiError: any) {
        logger.error('AI API error:', apiError.response?.data || apiError.message);
        throw apiError;
      }
    } catch (error: any) {
      logger.error('Failed to extract expense data:', error.message);
      throw new Error(`AI extraction failed: ${error.message}`);
    }
  }

  /**
   * Build extraction prompt for the AI model
   */
  private buildExtractionPrompt(text: string): string {
    return `Extract the following information from this receipt/invoice text and return it as a JSON object:

Required fields:
- amount: Total amount (number)
- currency: Currency code (e.g., "EUR", "USD")
- date: Date in YYYY-MM-DD format
- vendor: Vendor/merchant name
- category: Expense category (e.g., "office_supplies", "travel", "meals", "software", "utilities")

Optional fields:
- description: Brief description of the purchase
- tax_amount: Tax amount (number)
- tax_rate: Tax rate as decimal (e.g., 0.19 for 19%)

Receipt text:
${text}

Return only valid JSON with the extracted data. If a field cannot be determined, omit it or set it to null.`;
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
   * Validate date format (YYYY-MM-DD)
   */
  private isValidDate(dateString: string): boolean {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateString)) return false;
    
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime());
  }
}

// Export singleton instance
export const expenseExtractionService = new ExpenseExtractionService();
