import { each } from '../helpers/table';
import { Request, Response } from 'express';
import { ExpenseReceiptController } from '../../src/controllers/business/expenses/expense-receipt.controller';
import {
  ExpenseExtractionService,
  ReceiptAnalysisError,
} from '../../src/services/ai/expense-extraction.service';

/**
 * POST /api/expenses/analyze-receipt — API contract §5: stable error codes,
 * and the raw extracted text when AI is disabled.
 */
describe('ExpenseReceiptController.analyzeReceipt', () => {
  const USER = { id: '123e4567-e89b-12d3-a456-426614174000' };
  let controller: ExpenseReceiptController;
  let res: Response;

  const req = () =>
    ({
      user: USER,
      file: {
        buffer: Buffer.from('%PDF-1.4'),
        originalname: 'rechnung.pdf',
        mimetype: 'application/pdf',
        size: 8,
      },
    }) as unknown as Request;

  beforeEach(() => {
    controller = new ExpenseReceiptController();
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response;
    jest.spyOn(ExpenseExtractionService.prototype, 'initialize').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the raw extracted text when AI is disabled', async () => {
    jest.spyOn(ExpenseExtractionService.prototype, 'isEnabled').mockReturnValue(false);
    jest.spyOn(ExpenseExtractionService.prototype, 'extractDocumentText').mockResolvedValue('Rechnung 12,00 EUR');
    const extract = jest.spyOn(ExpenseExtractionService.prototype, 'extractExpenseData');

    await controller.analyzeReceipt(req(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        ai_enabled: false,
        data: { raw_text: 'Rechnung 12,00 EUR', confidence: 0 },
      })
    );
    expect(extract).not.toHaveBeenCalled();
  });

  it('passes the MIME type through to the converter', async () => {
    jest.spyOn(ExpenseExtractionService.prototype, 'isEnabled').mockReturnValue(false);
    const convert = jest.spyOn(ExpenseExtractionService.prototype, 'extractDocumentText').mockResolvedValue('t');
    await controller.analyzeReceipt(req(), res);
    expect(convert).toHaveBeenCalledWith(expect.any(Buffer), 'rechnung.pdf', 'application/pdf');
  });

  it('returns the extracted data when AI is enabled', async () => {
    jest.spyOn(ExpenseExtractionService.prototype, 'isEnabled').mockReturnValue(true);
    jest.spyOn(ExpenseExtractionService.prototype, 'extractDocumentText').mockResolvedValue('t');
    jest.spyOn(ExpenseExtractionService.prototype, 'extractExpenseData').mockResolvedValue({ amount: 12 } as any);

    await controller.analyzeReceipt(req(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, ai_enabled: true, data: { amount: 12 } })
    );
  });

  each([
    ['NO_TEXT', 'converter', 422],
    ['AI_UNREACHABLE', 'converter', 503],
    ['AI_UNREACHABLE', 'llm', 503],
    ['AI_TIMEOUT', 'llm', 504],
    ['AI_AUTH', 'llm', 502],
    ['AI_INVALID_RESPONSE', 'llm', 502],
    ['EXTRACTION_FAILED', 'converter', 502],
  ] as const)('maps %s (%s) to HTTP %i with a stable code', async (code, service, status) => {
    jest.spyOn(ExpenseExtractionService.prototype, 'isEnabled').mockReturnValue(true);
    jest.spyOn(ExpenseExtractionService.prototype, 'extractDocumentText').mockResolvedValue('t');
    jest
      .spyOn(ExpenseExtractionService.prototype, 'extractExpenseData')
      .mockRejectedValue(new ReceiptAnalysisError(code, service, 'short message'));

    await controller.analyzeReceipt(req(), res);

    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code, service, error: 'short message' })
    );
  });

  it('answers 500 INTERNAL without the raw message for unexpected errors', async () => {
    jest
      .spyOn(ExpenseExtractionService.prototype, 'extractDocumentText')
      .mockRejectedValue(new Error('relation "settings" does not exist at host db-internal'));

    await controller.analyzeReceipt(req(), res);

    expect(res.status).toHaveBeenCalledWith(500);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.code).toBe('INTERNAL');
    expect(JSON.stringify(body)).not.toContain('db-internal');
  });
});
