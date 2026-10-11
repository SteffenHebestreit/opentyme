import { each } from '../helpers/table';
import axios from 'axios';
import { Request, Response } from 'express';

const mockQuery = jest.fn();
jest.mock('../../src/utils/database', () => ({
  getDbClient: () => ({ query: (...args: unknown[]) => mockQuery(...args) }),
}));

const mockSendTestEmail = jest.fn();
jest.mock('../../src/services/external/email.service', () => ({
  emailService: { sendTestEmail: (...args: unknown[]) => mockSendTestEmail(...args) },
  getUserSmtpConfig: jest.fn(),
}));

import {
  getSettings,
  updateSettings,
  testAiConnection,
  testSttConnection,
  testSmtp,
  validateServiceUrl,
  buildSettingsUpdate,
} from '../../src/controllers/system/settings.controller';

const USER = { id: '123e4567-e89b-12d3-a456-426614174000' };

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response & { status: jest.Mock; json: jest.Mock };
}

function request(body: Record<string, unknown> = {}) {
  return { user: USER, body } as unknown as Request;
}

const SECRETS = ['ai_api_key', 'mcp_server_api_key', 'stt_api_key', 'smtp_pass'];

/** The column list of a SELECT ... FROM or a RETURNING clause, as plain text. */
function columnList(sql: string): string {
  const returning = sql.split(/RETURNING/i)[1];
  if (returning) return returning;
  return sql.split(/\bFROM settings\b/)[0];
}

describe('settings controller', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockSendTestEmail.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('GET /api/settings', () => {
    it('selects *_set flags instead of the secrets', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 's1', ai_api_key_set: true }] });
      const res = mockRes();
      await getSettings(request(), res);

      const sql: string = mockQuery.mock.calls[0][0];
      const columns = columnList(sql);
      for (const secret of SECRETS) {
        expect(columns).toContain(`AS ${secret}_set`);
        // only inside the IS NOT NULL expression, never as a plain column
        expect(columns.replace(new RegExp(`\\(${secret} IS NOT NULL AND ${secret} <> ''\\) AS ${secret}_set`), ''))
          .not.toMatch(new RegExp(`\\b${secret}\\b(?!_set)`));
      }
      expect(sql).not.toMatch(/\*/);
      expect(res.json).toHaveBeenCalledWith({ id: 's1', ai_api_key_set: true });
    });

    it('creates default settings without RETURNING *', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'new' }] });
      const res = mockRes();
      await getSettings(request(), res);
      for (const [sql] of mockQuery.mock.calls) {
        expect(sql).not.toMatch(/RETURNING \*/);
      }
      expect(res.json).toHaveBeenCalledWith({ id: 'new' });
    });
  });

  describe('PUT /api/settings', () => {
    it('never uses RETURNING * and returns *_set flags', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 's1', smtp_pass_set: true }] });
      const res = mockRes();
      await updateSettings(request({ company_name: 'ACME', smtp_pass: 'secret' }), res);

      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).not.toMatch(/RETURNING \*/);
      const returning = columnList(sql);
      expect(returning).toContain('AS smtp_pass_set');
      expect(returning).not.toMatch(/\bsmtp_pass\b(?!_set)(?! IS NOT NULL)(?! <> '')/);
      expect(res.json).toHaveBeenCalledWith({ id: 's1', smtp_pass_set: true });
    });

    it('applies the secret write rules', () => {
      const result = buildSettingsUpdate({
        ai_api_key: '',            // unchanged
        stt_api_key: undefined,    // unchanged
        mcp_server_api_key: null,  // cleared
        smtp_pass: 'p4ss',         // set
        company_name: 'ACME',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const fields = Object.fromEntries(result.assignments.map((a) => [a.field, a.value]));
      expect(fields).toEqual({ company_name: 'ACME', mcp_server_api_key: null, smtp_pass: 'p4ss' });
    });

    it('rejects a non-string secret', () => {
      const result = buildSettingsUpdate({ ai_api_key: 12345 });
      expect(result).toMatchObject({ ok: false, code: 'INVALID_FIELD', field: 'ai_api_key' });
    });

    it('answers 400 INVALID_URL with the field name', async () => {
      const res = mockRes();
      await updateSettings(request({ ai_api_url: 'ftp://llm:21' }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_URL', field: 'ai_api_url' }));
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('stores trimmed URLs and allows clearing them', () => {
      const result = buildSettingsUpdate({ stt_api_url: '  http://whisper:8000  ', mcp_server_url: '', ai_api_url: null });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(Object.fromEntries(result.assignments.map((a) => [a.field, a.value]))).toEqual({
        stt_api_url: 'http://whisper:8000',
        mcp_server_url: '',
        ai_api_url: null,
      });
    });

    it('treats a body with only unchanged secrets as nothing to update', async () => {
      const res = mockRes();
      await updateSettings(request({ ai_api_key: '' }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('validateServiceUrl', () => {
    each([
      ['http://10.10.0.2:1234/v1'],
      ['https://api.openai.com/v1'],
      ['http://mcp-server:8000'],
      ['http://localhost:1234/v1'],
    ])('accepts %s', (url) => {
      expect(validateServiceUrl(url)).toEqual({ ok: true, value: url });
    });

    each([
      ['ftp://example.com'],
      ['file:///etc/passwd'],
      ['javascript:alert(1)'],
      ['http://user:pass@llm:1234/v1'],
      ['http://token@llm:1234'],
      ['not a url'],
      ['llm:1234'],
      [42],
      [{}],
    ])('rejects %p', (url) => {
      expect(validateServiceUrl(url).ok).toBe(false);
    });

    it('allows empty and null', () => {
      expect(validateServiceUrl('')).toEqual({ ok: true, value: '' });
      expect(validateServiceUrl('   ')).toEqual({ ok: true, value: '' });
      expect(validateServiceUrl(null)).toEqual({ ok: true, value: null });
    });
  });

  describe('POST /api/settings/test-ai', () => {
    let get: ReturnType<typeof jest.spyOn>;

    beforeEach(() => {
      mockQuery.mockResolvedValue({
        rows: [{ ai_api_url: 'http://llm:1234/v1/', ai_api_key: 'sk-stored', ai_model: 'qwen/qwen3' }],
      });
      get = jest.spyOn(axios, 'get');
    });

    it('lists models and finds the configured one, using the stored key', async () => {
      get.mockResolvedValue({ status: 200, data: { data: [{ id: 'qwen/qwen3' }, { id: 'llama' }] } });
      const res = mockRes();
      await testAiConnection(request({}), res);

      expect(get).toHaveBeenCalledWith(
        'http://llm:1234/v1/models',
        expect.objectContaining({ timeout: 5000, headers: { Authorization: 'Bearer sk-stored' } })
      );
      const body = res.json.mock.calls[0][0];
      expect(body).toMatchObject({ ok: true, models: ['qwen/qwen3', 'llama'], modelFound: true });
      expect(typeof body.latencyMs).toBe('number');
      expect(body.code).toBeUndefined();
    });

    it('uses the values from the body over the stored ones', async () => {
      get.mockResolvedValue({ status: 200, data: { data: [{ id: 'other' }] } });
      const res = mockRes();
      await testAiConnection(
        request({ ai_api_url: 'https://api.example.com/v1', ai_api_key: 'sk-new', ai_model: 'gpt' }),
        res
      );
      expect(get).toHaveBeenCalledWith(
        'https://api.example.com/v1/models',
        expect.objectContaining({ headers: { Authorization: 'Bearer sk-new' } })
      );
      expect(res.json.mock.calls[0][0]).toMatchObject({ ok: true, modelFound: false, code: 'LLM_MODEL' });
    });

    it('sends no key when the body clears it', async () => {
      get.mockResolvedValue({ status: 200, data: { data: [] } });
      await testAiConnection(request({ ai_api_key: null }), mockRes());
      expect(get.mock.calls[0][1].headers).toEqual({});
    });

    it('reports modelFound null when no model is set', async () => {
      get.mockResolvedValue({ status: 200, data: { data: [{ id: 'a' }] } });
      const res = mockRes();
      await testAiConnection(request({ ai_model: '' }), res);
      expect(res.json.mock.calls[0][0]).toMatchObject({ ok: true, modelFound: null });
    });

    it('caps the model list at 50', async () => {
      get.mockResolvedValue({ status: 200, data: { data: Array.from({ length: 80 }, (_, i) => ({ id: `m${i}` })) } });
      const res = mockRes();
      await testAiConnection(request({}), res);
      expect(res.json.mock.calls[0][0].models).toHaveLength(50);
    });

    each([[401], [403]])('reports LLM_AUTH for HTTP %i', async (status) => {
      get.mockResolvedValue({ status, data: {} });
      const res = mockRes();
      await testAiConnection(request({}), res);
      expect(res.json.mock.calls[0][0]).toMatchObject({ ok: false, code: 'LLM_AUTH' });
    });

    it('reports LLM_UNREACHABLE for a refused connection', async () => {
      get.mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED 10.0.0.2:1234'), { code: 'ECONNREFUSED' }));
      const res = mockRes();
      await testAiConnection(request({}), res);
      const body = res.json.mock.calls[0][0];
      expect(body).toMatchObject({ ok: false, code: 'LLM_UNREACHABLE' });
      expect(JSON.stringify(body)).not.toContain('10.0.0.2');
    });

    it('reports LLM_TIMEOUT for a timeout', async () => {
      get.mockRejectedValue(Object.assign(new Error('timeout of 5000ms exceeded'), { code: 'ECONNABORTED' }));
      const res = mockRes();
      await testAiConnection(request({}), res);
      expect(res.json.mock.calls[0][0]).toMatchObject({ ok: false, code: 'LLM_TIMEOUT' });
    });

    it('reports INVALID_URL without calling out', async () => {
      const res = mockRes();
      await testAiConnection(request({ ai_api_url: 'file:///etc/passwd' }), res);
      expect(res.json.mock.calls[0][0]).toMatchObject({ ok: false, code: 'INVALID_URL' });
      expect(get).not.toHaveBeenCalled();
    });

    it('reports INVALID_URL when no URL is configured', async () => {
      mockQuery.mockResolvedValue({ rows: [{ ai_api_url: null, ai_api_key: null, ai_model: null }] });
      const res = mockRes();
      await testAiConnection(request({}), res);
      expect(res.json.mock.calls[0][0]).toMatchObject({ ok: false, code: 'INVALID_URL' });
    });
  });

  describe('POST /api/settings/test-stt', () => {
    let get: ReturnType<typeof jest.spyOn>;

    beforeEach(() => {
      mockQuery.mockResolvedValue({ rows: [{ stt_api_url: 'http://whisper:8000', stt_api_key: null }] });
      get = jest.spyOn(axios, 'get');
    });

    it('is reachable when /health answers below 500', async () => {
      get.mockResolvedValue({ status: 200, data: 'ok' });
      const res = mockRes();
      await testSttConnection(request({}), res);
      expect(get).toHaveBeenCalledTimes(1);
      expect(get.mock.calls[0][0]).toBe('http://whisper:8000/health');
      expect(res.json.mock.calls[0][0]).toMatchObject({ ok: true });
    });

    it('falls back to the base URL when /health answers 5xx', async () => {
      get.mockResolvedValueOnce({ status: 503 }).mockResolvedValueOnce({ status: 404 });
      const res = mockRes();
      await testSttConnection(request({ stt_api_url: 'http://stt:9000/' }), res);
      expect(get.mock.calls.map((c: any[]) => c[0])).toEqual(['http://stt:9000/health', 'http://stt:9000']);
      expect(res.json.mock.calls[0][0]).toMatchObject({ ok: true });
    });

    it('reports STT_UNREACHABLE when both answer 5xx', async () => {
      get.mockResolvedValue({ status: 502 });
      const res = mockRes();
      await testSttConnection(request({}), res);
      expect(res.json.mock.calls[0][0]).toMatchObject({ ok: false, code: 'STT_UNREACHABLE' });
    });

    it('reports STT_UNREACHABLE without retrying a refused host', async () => {
      get.mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }));
      const res = mockRes();
      await testSttConnection(request({}), res);
      expect(get).toHaveBeenCalledTimes(1);
      expect(res.json.mock.calls[0][0]).toMatchObject({ ok: false, code: 'STT_UNREACHABLE' });
    });

    it('reports STT_TIMEOUT', async () => {
      get.mockRejectedValue(Object.assign(new Error('timeout of 5000ms exceeded'), { code: 'ECONNABORTED' }));
      const res = mockRes();
      await testSttConnection(request({}), res);
      expect(res.json.mock.calls[0][0]).toMatchObject({ ok: false, code: 'STT_TIMEOUT' });
    });

    it('sends the given key as a Bearer token', async () => {
      get.mockResolvedValue({ status: 200 });
      await testSttConnection(request({ stt_api_key: 'stt-key' }), mockRes());
      expect(get.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer stt-key' });
    });

    it('reports INVALID_URL', async () => {
      const res = mockRes();
      await testSttConnection(request({ stt_api_url: 'http://u:p@stt:9000' }), res);
      expect(res.json.mock.calls[0][0]).toMatchObject({ ok: false, code: 'INVALID_URL' });
      expect(get).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/settings/test-smtp', () => {
    it('uses the stored password when the form sends none for the stored host/user', async () => {
      mockQuery.mockResolvedValue({ rows: [{ smtp_host: 'smtp.example.com', smtp_user: 'me', smtp_pass: 'stored' }] });
      mockSendTestEmail.mockResolvedValue(undefined);
      const res = mockRes();
      await testSmtp(request({ to: 'a@b.c', host: 'smtp.example.com', user: 'me', port: 587 }), res);
      expect(mockSendTestEmail.mock.calls[0][0]).toMatchObject({ host: 'smtp.example.com', pass: 'stored' });
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('does not send the stored password to a different host', async () => {
      mockQuery.mockResolvedValue({ rows: [{ smtp_host: 'smtp.example.com', smtp_user: 'me', smtp_pass: 'stored' }] });
      mockSendTestEmail.mockResolvedValue(undefined);
      await testSmtp(request({ to: 'a@b.c', host: 'evil.example.net', user: 'me' }), mockRes());
      expect(mockSendTestEmail.mock.calls[0][0].pass).toBeUndefined();
    });
  });
});
