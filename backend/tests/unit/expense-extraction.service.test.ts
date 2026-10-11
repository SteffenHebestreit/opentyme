import { each } from '../helpers/table';
import axios from 'axios';

const mockQuery = jest.fn();
jest.mock('../../src/utils/database', () => ({
  getDbClient: () => ({ query: (...args: unknown[]) => mockQuery(...args) }),
}));

import {
  ExpenseExtractionService,
  ReceiptAnalysisError,
} from '../../src/services/ai/expense-extraction.service';
import { DocumentConverterClient, DocumentConversionError } from '../../src/services/ai/mcp-client.service';

const USER = '123e4567-e89b-12d3-a456-426614174000';

function settingsRow(overrides: Record<string, unknown> = {}) {
  return {
    rows: [
      {
        ai_enabled: true,
        ai_provider: 'openai',
        ai_api_url: 'http://llm:1234/v1',
        ai_api_key: 'sk-test',
        ai_model: 'qwen',
        mcp_server_url: 'http://converter:8000',
        ...overrides,
      },
    ],
  };
}

function completion(content: unknown, finish_reason = 'stop', extra: Record<string, unknown> = {}) {
  return { data: { choices: [{ message: { content, ...extra }, finish_reason }] } };
}

const VALID_ANSWER = JSON.stringify({
  description: 'ProtoArc XK01 Bluetooth-Tastatur',
  vendor: 'Amazon',
  seller: null,
  invoice_number: 'INV-1',
  amount: '1.234,56',
  currency: 'EUR',
  date: '02.03.2026',
  tax_amount: 197.12,
  tax_rate: 19,
  category: 'peripherals',
  line_items: [],
});

describe('ExpenseExtractionService', () => {
  let post: jest.Mock;
  let createSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    mockQuery.mockReset();
    post = jest.fn();
    createSpy = jest.spyOn(axios, 'create').mockReturnValue({ post } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function enabledService() {
    mockQuery.mockResolvedValue(settingsRow());
    const service = new ExpenseExtractionService();
    await service.initialize(USER);
    return service;
  }

  describe('initialize', () => {
    it('sets up the document converter even when AI is disabled', async () => {
      mockQuery.mockResolvedValue(settingsRow({ ai_enabled: false }));
      const service = new ExpenseExtractionService();
      await service.initialize(USER);

      expect(service.isEnabled()).toBe(false);
      const extract = jest
        .spyOn(DocumentConverterClient.prototype, 'extractDocumentText')
        .mockResolvedValue('raw receipt text');
      await expect(service.extractDocumentText(Buffer.from('x'), 'a.pdf', 'application/pdf')).resolves.toBe(
        'raw receipt text'
      );
      expect(extract).toHaveBeenCalledWith(expect.any(Buffer), 'a.pdf', 'application/pdf');
      // Only the converter client was created — no LLM client
      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(createSpy.mock.calls[0][0]).toMatchObject({ baseURL: 'http://converter:8000' });
    });

    it('still sets up the converter when the settings cannot be loaded', async () => {
      mockQuery.mockRejectedValue(new Error('db down'));
      const service = new ExpenseExtractionService();
      await service.initialize(USER);
      expect(service.isEnabled()).toBe(false);
      jest.spyOn(DocumentConverterClient.prototype, 'extractDocumentText').mockResolvedValue('t');
      await expect(service.extractDocumentText(Buffer.from('x'), 'a.pdf')).resolves.toBe('t');
    });

    it('sends the API key as a Bearer token', async () => {
      await enabledService();
      const llmConfig = createSpy.mock.calls.find((call: any[]) => call[0].baseURL === 'http://llm:1234/v1')![0];
      expect(llmConfig.headers.Authorization).toBe('Bearer sk-test');
    });
  });

  describe('extractDocumentText error mapping', () => {
    each([
      ['NO_TEXT', 'NO_TEXT'],
      ['UNREACHABLE', 'AI_UNREACHABLE'],
      ['TIMEOUT', 'AI_TIMEOUT'],
      ['FAILED', 'EXTRACTION_FAILED'],
    ] as const)('maps converter %s to %s', async (converterCode, code) => {
      const service = await enabledService();
      jest
        .spyOn(DocumentConverterClient.prototype, 'extractDocumentText')
        .mockRejectedValue(new DocumentConversionError(converterCode, 'x'));
      await expect(service.extractDocumentText(Buffer.from('x'), 'a.pdf')).rejects.toMatchObject({
        code,
        service: 'converter',
      });
    });
  });

  describe('extractExpenseData', () => {
    it('parses German amounts, dates and a percentage tax rate', async () => {
      const service = await enabledService();
      post.mockResolvedValue(completion(VALID_ANSWER));

      const result = await service.extractExpenseData('receipt text');
      expect(result.amount).toBe(1234.56);
      expect(result.date).toBe('2026-03-02');
      expect(result.tax_rate).toBe(0.19);
      expect(result.category).toBe('peripherals');
      expect(result.seller).toBeUndefined();
    });

    it('keeps a 0 % tax rate', async () => {
      const service = await enabledService();
      post.mockResolvedValue(completion(VALID_ANSWER.replace('"tax_rate":19', '"tax_rate":0')));
      const result = await service.extractExpenseData('receipt text');
      expect(result.tax_rate).toBe(0);
    });

    it('strips complete and unclosed <think> blocks', async () => {
      const service = await enabledService();
      post.mockResolvedValueOnce(completion(`<think>{"amount": 1}</think>\n${VALID_ANSWER}`));
      await expect(service.extractExpenseData('t')).resolves.toMatchObject({ amount: 1234.56 });

      post.mockResolvedValueOnce(completion(`${VALID_ANSWER}\n<think>let me double check {"amount": 2}`));
      await expect(service.extractExpenseData('t')).resolves.toMatchObject({ amount: 1234.56 });

      // Opening tag was part of the chat template: only the closing tag shows up
      post.mockResolvedValueOnce(completion(`reasoning {"amount": 3} </think>${VALID_ANSWER}`));
      await expect(service.extractExpenseData('t')).resolves.toMatchObject({ amount: 1234.56 });
    });

    it('never parses reasoning_content as the answer', async () => {
      const service = await enabledService();
      post.mockResolvedValue(completion('', 'length', { reasoning_content: VALID_ANSWER }));
      await expect(service.extractExpenseData('t')).rejects.toMatchObject({
        name: 'ReceiptAnalysisError',
        code: 'AI_INVALID_RESPONSE',
      });
    });

    it('treats an empty answer as an invalid response', async () => {
      const service = await enabledService();
      post.mockResolvedValue(completion(null, 'stop', { reasoning_content: VALID_ANSWER }));
      await expect(service.extractExpenseData('t')).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' });
    });

    it('asks reasoning models for a generous token budget', async () => {
      const service = await enabledService();
      post.mockResolvedValue(completion(VALID_ANSWER));
      await service.extractExpenseData('t');
      expect(post.mock.calls[0][1].max_tokens).toBeGreaterThanOrEqual(8000);
    });

    each([
      [Object.assign(new Error('connect ECONNREFUSED 10.0.0.2:1234'), { code: 'ECONNREFUSED' }), 'AI_UNREACHABLE'],
      [Object.assign(new Error('connect EHOSTUNREACH 10.0.0.2:1234'), { code: 'EHOSTUNREACH' }), 'AI_UNREACHABLE'],
      [Object.assign(new Error('connect ENETUNREACH 10.0.0.2:1234'), { code: 'ENETUNREACH' }), 'AI_UNREACHABLE'],
      [Object.assign(new Error('connect ETIMEDOUT 10.0.0.2:1234'), { code: 'ETIMEDOUT', syscall: 'connect' }), 'AI_UNREACHABLE'],
      [Object.assign(new Error('timeout of 180000ms exceeded'), { code: 'ECONNABORTED' }), 'AI_TIMEOUT'],
      [Object.assign(new Error('Request failed with status code 401'), { response: { status: 401, data: {} } }), 'AI_AUTH'],
      [Object.assign(new Error('Request failed with status code 404'), { response: { status: 404, data: {} } }), 'AI_INVALID_RESPONSE'],
    ])('maps %s to %s', async (error, code) => {
      const service = await enabledService();
      post.mockRejectedValue(error);
      const thrown = await service.extractExpenseData('t').catch((e) => e);
      expect(thrown).toBeInstanceOf(ReceiptAnalysisError);
      expect(thrown).toMatchObject({ code, service: 'llm' });
    });

    it('retries once without response_format when the server rejects it', async () => {
      const service = await enabledService();
      post
        .mockRejectedValueOnce(Object.assign(new Error('400'), { response: { status: 400, data: { error: 'no' } } }))
        .mockResolvedValueOnce(completion(VALID_ANSWER));
      await expect(service.extractExpenseData('t')).resolves.toMatchObject({ amount: 1234.56 });
      expect(post.mock.calls[0][1].response_format).toBeDefined();
      expect(post.mock.calls[1][1].response_format).toBeUndefined();
    });

    it('reports non-JSON output as an invalid response', async () => {
      const service = await enabledService();
      post.mockResolvedValue(completion('Sorry, I cannot read this receipt.'));
      await expect(service.extractExpenseData('t')).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' });
    });
  });

  describe('number, tax rate and date parsing', () => {
    const service = new ExpenseExtractionService() as any;

    each([
      ['1.234,56', 1234.56],
      ['1.234,56 €', 1234.56],
      ['1.234', 1234],
      ['1.234.567', 1234567],
      ['12,50', 12.5],
      ['51,99 EUR', 51.99],
      ['1,234.56', 1234.56],
      ['1,234', 1234],
      ['12.50', 12.5],
      ['0.500', 0.5],
      ['0,5', 0.5],
      ['-12,50', -12.5],
      ['€ 1 234,56', 1234.56],
      ['0', 0],
      [0, 0],
      [19.99, 19.99],
    ])('toNumber(%p) = %p', (input, expected) => {
      expect(service.toNumber(input)).toBe(expected);
    });

    each([[''], ['abc'], ['1,2,3'], ['1.2.3'], [null], [undefined], [NaN]])(
      'toNumber(%p) is undefined',
      (input) => {
        expect(service.toNumber(input)).toBeUndefined();
      }
    );

    each([
      [0.19, 0.19],
      [19, 0.19],
      ['19 %', 0.19],
      ['7,0', 0.07],
      [0, 0],
      ['0', 0],
      [0.07, 0.07],
    ])('toTaxRate(%p) = %p', (input, expected) => {
      expect(service.toTaxRate(input)).toBe(expected);
    });

    each([[-5], [1], [150], ['abc'], [null]])('toTaxRate(%p) is dropped', (input) => {
      expect(service.toTaxRate(input)).toBeUndefined();
    });

    each([
      ['2026-03-02', '2026-03-02'],
      ['02.03.2026', '2026-03-02'],
      ['2.3.2026', '2026-03-02'],
      ['02/03/2026', '2026-03-02'],
      ['2026-03-02T10:00:00Z', '2026-03-02'],
      ['29.02.2024', '2024-02-29'],
    ])('toIsoDate(%p) = %p', (input, expected) => {
      expect(service.toIsoDate(input)).toBe(expected);
    });

    each([['2026-02-30'], ['30.02.2026'], ['29.02.2026'], ['2026-13-01'], ['31.04.2026'], ['yesterday'], ['']])(
      'toIsoDate(%p) rejects impossible or unparseable dates',
      (input) => {
        expect(service.toIsoDate(input)).toBeUndefined();
      }
    );
  });
});
