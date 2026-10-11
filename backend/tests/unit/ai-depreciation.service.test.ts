import { each } from '../helpers/table';
import axios from 'axios';

const mockQuery = jest.fn();
jest.mock('../../src/utils/database', () => ({
  getDbClient: () => ({ query: (...args: unknown[]) => mockQuery(...args) }),
}));

// No MCP gateway: the AfA analysis must not claim web research.
const mockCallTool = jest.fn();
jest.mock('../../src/services/mcp/mcp-client.service', () => ({
  mcpClient: {
    isConnected: () => false,
    callTool: (...args: unknown[]) => mockCallTool(...args),
  },
}));

import {
  AIDepreciationService,
  ExpenseForAnalysis,
} from '../../src/services/financial/ai-depreciation.service';

const USER = '123e4567-e89b-12d3-a456-426614174000';

function expense(overrides: Partial<ExpenseForAnalysis> = {}): ExpenseForAnalysis {
  return {
    id: 'exp-1',
    description: 'Something',
    notes: '',
    category: 'other',
    amount: 0,
    net_amount: 0,
    tax_amount: 0,
    tax_rate: 0.19,
    expense_date: '2026-04-15',
    ...overrides,
  };
}

function settings(overrides: Record<string, unknown> = {}) {
  return {
    rows: [
      {
        ai_enabled: true,
        ai_provider: 'openai',
        ai_api_url: 'http://llm:1234/v1',
        ai_api_key: 'sk-secret',
        ai_model: 'qwen',
        ...overrides,
      },
    ],
  };
}

function chat(content: unknown, finish_reason = 'stop') {
  return { data: { choices: [{ message: { content }, finish_reason }] } };
}

describe('AIDepreciationService', () => {
  let post: jest.Mock;
  let createSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    mockQuery.mockReset();
    mockCallTool.mockReset();
    post = jest.fn();
    createSpy = jest.spyOn(axios, 'create').mockReturnValue({ post } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function enabledService(overrides: Record<string, unknown> = {}) {
    mockQuery.mockResolvedValue(settings(overrides));
    const service = new AIDepreciationService();
    await service.initialize(USER);
    return service;
  }

  describe('initialize', () => {
    it('sends the API key as a real Bearer token', async () => {
      await enabledService();
      const config = createSpy.mock.calls[0][0];
      expect(config.headers.Authorization).toBe('Bearer sk-secret');
      expect(config.headers.Authorization).not.toContain('${');
    });

    it('uses a long timeout suited to local reasoning models', async () => {
      await enabledService();
      expect(createSpy.mock.calls[0][0].timeout).toBeGreaterThanOrEqual(120000);
    });

    it('uses x-api-key for Anthropic', async () => {
      await enabledService({ ai_provider: 'anthropic' });
      const headers = createSpy.mock.calls[0][0].headers;
      expect(headers['x-api-key']).toBe('sk-secret');
      expect(headers.Authorization).toBeUndefined();
    });

    it('sends no Authorization header without a key', async () => {
      await enabledService({ ai_api_key: null });
      expect(createSpy.mock.calls[0][0].headers.Authorization).toBeUndefined();
    });
  });

  describe('rules-based fallback (German tax thresholds)', () => {
    const service = new AIDepreciationService();

    it('marks every rules result with source "rules" and the error code', () => {
      const result = service.basicDepreciationRules(expense({ net_amount: 100 }), 'AI_TIMEOUT');
      expect(result.source).toBe('rules');
      expect(result.ai_error_code).toBe('AI_TIMEOUT');
      expect(result.confidence).toBeLessThanOrEqual(0.6);
    });

    each([
      [100, 'immediate', true],
      [250, 'immediate', true],
      [500, 'immediate', true],
      [800, 'immediate', true],
    ] as const)('%d € net → %s, GWG %s', (net, recommendation, gwg) => {
      const result = service.basicDepreciationRules(expense({ net_amount: net }));
      expect(result.recommendation).toBe(recommendation);
      expect(result.gwg_applicable).toBe(gwg);
      expect(result.tax_deductible_amount).toBe(net);
      expect(result.requires_depreciation).toBe(false);
    });

    it('800.01–1000 € net is NOT written off immediately (GWG limit is 800 € net)', () => {
      const result = service.basicDepreciationRules(
        expense({ net_amount: 900, category: 'office_furniture', expense_date: '2026-04-15' })
      );
      expect(result.recommendation).toBe('partial');
      expect(result.gwg_applicable).toBe(false);
      expect(result.requires_depreciation).toBe(true);
      expect(result.suggested_years).toBe(13);
      // April: 9 of 12 months in the first year
      expect(result.tax_deductible_amount).toBeCloseTo((900 / 13) * (9 / 12), 2);
      expect(result.reasoning).toMatch(/Sammelposten/);
      expect(result.references).toContain('§ 6 Abs. 2a EStG');
    });

    it('800.01 € net is already above the GWG limit', () => {
      const result = service.basicDepreciationRules(expense({ net_amount: 800.01, category: 'tools' }));
      expect(result.recommendation).toBe('partial');
      expect(result.gwg_applicable).toBe(false);
    });

    each([
      ['vehicle_car', 6],
      ['office_furniture', 13],
      ['camera', 7],
      ['vehicle_motorcycle', 7],
      ['tools', 5],
    ] as const)('above 1000 € uses the useful life of category %s (%d years)', (category, years) => {
      const result = service.basicDepreciationRules(
        expense({ net_amount: 12000, category, expense_date: '2026-01-10' })
      );
      expect(result.recommendation).toBe('partial');
      expect(result.suggested_years).toBe(years);
      // January: the full first year
      expect(result.tax_deductible_amount).toBeCloseTo(12000 / years, 2);
      expect(result.reasoning).not.toMatch(/Sammelposten/);
    });

    it('IT hardware above 1000 € has a 1-year useful life (full deduction)', () => {
      const result = service.basicDepreciationRules(
        expense({ net_amount: 2400, category: 'computer', expense_date: '2026-11-03' })
      );
      expect(result.recommendation).toBe('partial');
      expect(result.suggested_years).toBe(1);
      expect(result.tax_deductible_amount).toBe(2400);
    });

    it('falls back to description keywords, then to 5 years with low confidence', () => {
      const laptop = service.basicDepreciationRules(
        expense({ net_amount: 1500, category: 'other', description: 'Lenovo Laptop T14' })
      );
      expect(laptop.suggested_years).toBe(1);

      const unknown = service.basicDepreciationRules(
        expense({ net_amount: 1500, category: 'other', description: 'Werkbank' })
      );
      expect(unknown.suggested_years).toBe(5);
      expect(unknown.confidence).toBeLessThan(laptop.confidence);
    });

    it('treats operating expense categories as immediately deductible at any amount', () => {
      const result = service.basicDepreciationRules(
        expense({ net_amount: 2400, category: 'insurance', description: 'Berufshaftpflicht 2026' })
      );
      expect(result.recommendation).toBe('immediate');
      expect(result.tax_deductible_amount).toBe(2400);
      expect(result.requires_depreciation).toBe(false);
    });
  });

  describe('analyzeExpense', () => {
    it('returns rules with AI_DISABLED when AI is off', async () => {
      mockQuery.mockResolvedValue(settings({ ai_enabled: false }));
      const service = new AIDepreciationService();
      await service.initialize(USER);
      const result = await service.analyzeExpense(expense({ net_amount: 500 }));
      expect(result).toMatchObject({ source: 'rules', ai_error_code: 'AI_DISABLED' });
      expect(post).not.toHaveBeenCalled();
    });

    it('marks a parsed AI answer as source "ai"', async () => {
      const service = await enabledService();
      post.mockResolvedValue(
        chat(JSON.stringify({
          recommendation: 'immediate',
          reasoning: 'GWG',
          suggested_years: 0,
          suggested_category: 'peripherals',
          tax_deductible_percentage: 100,
          tax_deductibility_reasoning: 'ok',
          confidence: 0.9,
          sources: [],
        }))
      );
      const result = await service.analyzeExpense(expense({ net_amount: 300, category: 'peripherals' }));
      expect(result.source).toBe('ai');
      expect(result.ai_error_code).toBeUndefined();
      expect(result.recommendation).toBe('immediate');
      expect(result.suggested_years).toBeNull();
    });

    it('keeps 0 % deductibility and 0 confidence from the AI', async () => {
      const service = await enabledService();
      post.mockResolvedValue(
        chat(JSON.stringify({ recommendation: 'immediate', tax_deductible_percentage: 0, confidence: 0 }))
      );
      const result = await service.analyzeExpense(expense({ net_amount: 300, category: 'insurance' }));
      expect(result.tax_deductible_percentage).toBe(0);
      expect(result.confidence).toBe(0);
    });

    each([
      [150, 100],
      [-5, 100],
      ['abc', 100],
      [undefined, 100],
      [60, 60],
      ['30%', 30],
    ])('validates tax_deductible_percentage %p → %p', async (input, expected) => {
      const service = await enabledService();
      post.mockResolvedValue(chat(JSON.stringify({ recommendation: 'immediate', tax_deductible_percentage: input })));
      const result = await service.analyzeExpense(expense({ net_amount: 300 }));
      expect(result.tax_deductible_percentage).toBe(expected);
    });

    each([
      [0.95, 0.95],
      [85, 0.85],
      [-1, 0.8],
      [500, 0.8],
      [undefined, 0.8],
    ] as const)('validates confidence %p → %p', async (input, expected) => {
      const service = await enabledService();
      post.mockResolvedValue(chat(JSON.stringify({ recommendation: 'immediate', confidence: input })));
      const result = await service.analyzeExpense(expense({ net_amount: 300 }));
      expect(result.confidence).toBeCloseTo(expected, 5);
    });

    it('computes the first-year deduction for "partial" without years from the category', async () => {
      const service = await enabledService();
      post.mockResolvedValue(chat(JSON.stringify({ recommendation: 'partial', suggested_category: 'vehicle_car' })));
      const result = await service.analyzeExpense(
        expense({ net_amount: 36000, category: 'vehicle_car', expense_date: '2026-07-01' })
      );
      expect(result.suggested_years).toBe(6);
      // July: 6 of 12 months
      expect(result.tax_deductible_amount).toBeCloseTo((36000 / 6) * (6 / 12), 2);
      expect(result.requires_depreciation).toBe(true);
    });

    it('sets gwg_applicable for net amounts up to and including 800 €', async () => {
      const service = await enabledService();
      post.mockResolvedValue(chat(JSON.stringify({ recommendation: 'immediate' })));
      expect((await service.analyzeExpense(expense({ net_amount: 800 }))).gwg_applicable).toBe(true);
      expect((await service.analyzeExpense(expense({ net_amount: 950 }))).gwg_applicable).toBe(false);
    });

    it('strips <think> blocks and never uses reasoning_content', async () => {
      const service = await enabledService();
      post.mockResolvedValueOnce(
        chat(`<think>{"recommendation": "partial"}</think>{"recommendation": "immediate", "confidence": 0.7}`)
      );
      const result = await service.analyzeExpense(expense({ net_amount: 300 }));
      expect(result.recommendation).toBe('immediate');
      expect(result.source).toBe('ai');
    });

    it('falls back after an unusable answer, retrying once', async () => {
      const service = await enabledService();
      post.mockResolvedValue(chat('I am not sure.'));
      const result = await service.analyzeExpense(expense({ net_amount: 300 }));
      expect(result).toMatchObject({ source: 'rules', ai_error_code: 'AI_INVALID_RESPONSE' });
      expect(post).toHaveBeenCalledTimes(2);
    });

    it('does not retry when the model ran out of token budget', async () => {
      const service = await enabledService();
      post.mockResolvedValue(chat('', 'length'));
      const result = await service.analyzeExpense(expense({ net_amount: 300 }));
      expect(result).toMatchObject({ source: 'rules', ai_error_code: 'AI_INVALID_RESPONSE' });
      expect(post).toHaveBeenCalledTimes(1);
    });

    each([
      [Object.assign(new Error('connect ECONNREFUSED 10.0.0.2:1234'), { code: 'ECONNREFUSED' }), 'AI_UNREACHABLE'],
      [Object.assign(new Error('connect EHOSTUNREACH 10.0.0.2:1234'), { code: 'EHOSTUNREACH' }), 'AI_UNREACHABLE'],
      [Object.assign(new Error('timeout of 180000ms exceeded'), { code: 'ECONNABORTED' }), 'AI_TIMEOUT'],
      [Object.assign(new Error('401'), { response: { status: 401 } }), 'AI_AUTH'],
      [Object.assign(new Error('500'), { response: { status: 500 } }), 'AI_INVALID_RESPONSE'],
    ])('does not retry transport errors and reports %s as %s', async (error, code) => {
      const service = await enabledService();
      post.mockRejectedValue(error);
      const result = await service.analyzeExpense(expense({ net_amount: 1200, category: 'computer' }));
      expect(result).toMatchObject({ source: 'rules', ai_error_code: code });
      expect(post).toHaveBeenCalledTimes(1);
    });

    it('treats azure / custom providers as OpenAI-compatible instead of skipping the AI', async () => {
      const service = await enabledService({ ai_provider: 'custom' });
      post.mockResolvedValue(chat(JSON.stringify({ recommendation: 'immediate' })));
      const result = await service.analyzeExpense(expense({ net_amount: 300 }));
      expect(result.source).toBe('ai');
      expect(post.mock.calls[0][0]).toBe('/chat/completions');
    });

    it('does not claim web research or verified sources when no search ran', async () => {
      const service = await enabledService();
      post.mockResolvedValue(chat(JSON.stringify({ recommendation: 'partial', suggested_years: 6 })));
      await service.analyzeExpense(
        expense({ net_amount: 60000, category: 'vehicle_car', description: 'KIA EV9 GT-Line' })
      );
      const prompt: string = post.mock.calls[0][1].messages[1].content;
      expect(prompt).not.toMatch(/WEB SEARCH RESULTS/);
      expect(prompt).not.toMatch(/VERIFIED SOURCES/);
      expect(prompt).not.toMatch(/KIA EV9 Information/);
      expect(prompt).toMatch(/no web search was performed/);
      expect(mockCallTool).not.toHaveBeenCalled();
    });

    it('drops sources the model was not offered', async () => {
      const service = await enabledService();
      post.mockResolvedValue(
        chat(JSON.stringify({
          recommendation: 'immediate',
          sources: [
            { title: 'Made up', url: 'https://example.com/fake' },
            { title: '§ 6 EStG', url: 'https://www.gesetze-im-internet.de/estg/__6.html' },
          ],
        }))
      );
      const result = await service.analyzeExpense(expense({ net_amount: 300, category: 'peripherals' }));
      expect(result.sources).toEqual([{ title: '§ 6 EStG', url: 'https://www.gesetze-im-internet.de/estg/__6.html' }]);
    });
  });
});
