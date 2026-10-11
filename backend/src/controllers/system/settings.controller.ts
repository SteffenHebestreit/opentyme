/**
 * @fileoverview Settings Controller
 * Handles user settings and company information management
 *
 * Secrets (API keys, SMTP password) are write-only over the API: responses
 * carry `<field>_set` booleans instead of the values (API contract §1). The
 * backend still reads the stored values internally (AI services, email).
 */

import { Request, Response } from 'express';
import axios from 'axios';
import { getDbClient } from '../../utils/database';
import { logger } from '../../utils/logger';
import { classifyUpstreamError } from '../../utils/upstream-error';
import { emailService, getUserSmtpConfig, SmtpConfig } from '../../services/external/email.service';

/** Write-only columns. Never selected for or returned to the client. */
export const SECRET_FIELDS = ['ai_api_key', 'mcp_server_api_key', 'stt_api_key', 'smtp_pass'] as const;

/** Service URL columns, validated on write. */
export const URL_FIELDS = ['ai_api_url', 'stt_api_url', 'mcp_server_url'] as const;

/** Readable columns, in response order. */
const PUBLIC_COLUMNS = [
  'id',
  'user_id',
  'user_region',
  'company_name',
  'company_address',
  'company_city',
  'company_state',
  'company_postal_code',
  'company_country',
  'company_tax_id',
  'company_email',
  'company_phone',
  'company_website',
  'company_logo_url',
  'company_subline',
  'invoice_prefix',
  'invoice_number_start',
  'invoice_number_current',
  'default_tax_rate',
  'default_currency',
  'default_payment_terms',
  'bank_name',
  'bank_iban',
  'bank_bic',
  'bank_account_holder',
  'ai_enabled',
  'ai_provider',
  'ai_api_url',
  'ai_model',
  'mcp_server_url',
  'stt_enabled',
  'stt_provider',
  'stt_api_url',
  'stt_model',
  'stt_language',
  'smtp_enabled',
  'smtp_host',
  'smtp_port',
  'smtp_user',
  'smtp_from',
  'smtp_secure',
  'theme_primary_color',
  'theme_secondary_color',
  'theme_accent_color',
  'theme_background_image_url',
  'invoice_language',
  'overdue_reminders_enabled',
  'created_at',
  'updated_at',
];

/** Explicit column list for SELECT / RETURNING: public columns plus `<secret>_set` flags. */
export const SETTINGS_RESPONSE_COLUMNS = [
  ...PUBLIC_COLUMNS,
  ...SECRET_FIELDS.map((field) => `(${field} IS NOT NULL AND ${field} <> '') AS ${field}_set`),
].join(',\n        ');

/** Columns PUT /api/settings may change (secrets and URLs are handled specially). */
const UPDATABLE_FIELDS = [
  'user_region',
  'company_name',
  'company_address',
  'company_city',
  'company_state',
  'company_postal_code',
  'company_country',
  'company_tax_id',
  'company_email',
  'company_phone',
  'company_website',
  'company_logo_url',
  'company_subline',
  'invoice_prefix',
  'invoice_number_start',
  'invoice_number_current',
  'default_tax_rate',
  'default_currency',
  'default_payment_terms',
  'bank_name',
  'bank_iban',
  'bank_bic',
  'bank_account_holder',
  'ai_enabled',
  'ai_provider',
  'ai_api_url',
  'ai_api_key',
  'ai_model',
  'mcp_server_url',
  'mcp_server_api_key',
  'stt_enabled',
  'stt_provider',
  'stt_api_url',
  'stt_api_key',
  'stt_model',
  'stt_language',
  'smtp_enabled',
  'smtp_host',
  'smtp_port',
  'smtp_user',
  'smtp_pass',
  'smtp_from',
  'smtp_secure',
  'theme_primary_color',
  'theme_secondary_color',
  'theme_accent_color',
  'theme_background_image_url',
  'invoice_language',
  'overdue_reminders_enabled',
];

/** Timeout for the connection tests. */
const CONNECTION_TEST_TIMEOUT_MS = 5000;
/** At most this many model ids are returned by the AI connection test. */
const MAX_LISTED_MODELS = 50;

/**
 * Validate a service URL setting.
 *
 * Empty / null are allowed (the setting is cleared). Anything else must parse
 * as an http(s) URL without embedded credentials.
 *
 * @returns the value to store (trimmed), or `{ ok: false }`
 */
export function validateServiceUrl(value: unknown): { ok: true; value: string | null } | { ok: false } {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false };

  const trimmed = value.trim();
  if (trimmed === '') return { ok: true, value: '' };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false };
  if (url.username || url.password) return { ok: false };
  if (!url.hostname) return { ok: false };
  return { ok: true, value: trimmed };
}

/**
 * Turn a PUT body into the SET clause of the settings update.
 *
 * Secrets: `undefined` or `''` → unchanged, `null` → cleared, non-empty
 * string → set. URL fields are validated. Other fields are written as given
 * whenever present (unchanged behaviour).
 */
export function buildSettingsUpdate(
  body: Record<string, unknown>
):
  | { ok: true; assignments: Array<{ field: string; value: unknown }> }
  | { ok: false; status: number; error: string; code: string; field: string } {
  const assignments: Array<{ field: string; value: unknown }> = [];

  for (const field of UPDATABLE_FIELDS) {
    const value = body[field];
    if (value === undefined) continue;

    if ((SECRET_FIELDS as readonly string[]).includes(field)) {
      if (value === '') continue;
      if (value !== null && typeof value !== 'string') {
        return { ok: false, status: 400, error: `Invalid value for ${field}`, code: 'INVALID_FIELD', field };
      }
      assignments.push({ field, value });
      continue;
    }

    if ((URL_FIELDS as readonly string[]).includes(field)) {
      const checked = validateServiceUrl(value);
      if (!checked.ok) {
        return {
          ok: false,
          status: 400,
          error: 'Invalid URL: use an http:// or https:// address without credentials',
          code: 'INVALID_URL',
          field,
        };
      }
      assignments.push({ field, value: checked.value });
      continue;
    }

    assignments.push({ field, value });
  }

  return { ok: true, assignments };
}

/**
 * Get current user's settings
 *
 * @route GET /api/settings
 * @access Protected (requires authentication)
 */
export const getSettings = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({ error: 'User not authenticated' });
    return;
  }

  try {
    const pool = getDbClient();
    const selectQuery = `SELECT
        ${SETTINGS_RESPONSE_COLUMNS}
      FROM settings
      WHERE user_id = $1`;
    const result = await pool.query(selectQuery, [userId]);

    if (result.rows.length === 0) {
      // Create default settings for new user
      await pool.query(
        `INSERT INTO settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
        [userId]
      );
      const created = await pool.query(selectQuery, [userId]);
      res.json(created.rows[0]);
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Failed to get settings', { error: (error as Error)?.message, userId });
    res.status(500).json({ error: 'Failed to retrieve settings' });
  }
};

/**
 * Update current user's settings
 *
 * @route PUT /api/settings
 * @access Protected (requires authentication)
 */
export const updateSettings = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({ error: 'User not authenticated' });
    return;
  }

  try {
    const pool = getDbClient();

    const update = buildSettingsUpdate((req.body ?? {}) as Record<string, unknown>);
    if (!update.ok) {
      res.status(update.status).json({ error: update.error, code: update.code, field: update.field });
      return;
    }

    if (update.assignments.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    const values: unknown[] = [userId];
    const updates = update.assignments.map(({ field, value }) => {
      values.push(value);
      return `${field} = $${values.length}`;
    });

    // Always update updated_at
    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    const query = `
      UPDATE settings
      SET ${updates.join(', ')}
      WHERE user_id = $1
      RETURNING
        ${SETTINGS_RESPONSE_COLUMNS}
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      // Create settings if not exists, then update with provided fields
      await pool.query(
        `INSERT INTO settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
        [userId]
      );
      const updateResult = await pool.query(query, values);
      res.json(updateResult.rows[0]);
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Failed to update settings', { error: (error as Error)?.message, userId });
    res.status(500).json({ error: 'Failed to update settings' });
  }
};

/**
 * Resolve a connection-test parameter: absent → stored value.
 */
function pick<T>(bodyValue: T | undefined, storedValue: T | undefined): T | undefined {
  return bodyValue !== undefined ? bodyValue : storedValue;
}

/**
 * Resolve a secret for a connection test: absent or '' → stored value,
 * null → no secret (the form cleared it).
 */
function pickSecret(bodyValue: unknown, storedValue: string | null | undefined): string | undefined {
  if (bodyValue === undefined || bodyValue === '') return storedValue || undefined;
  if (typeof bodyValue === 'string') return bodyValue;
  return undefined;
}

/** Extract model ids from an OpenAI-style (`data[].id`) or Ollama-style (`models[].name`) list. */
function extractModelIds(data: unknown): string[] | null {
  const body = data as { data?: unknown; models?: unknown } | null;
  const list = Array.isArray(body?.data) ? body!.data : Array.isArray(body?.models) ? body!.models : null;
  if (!list) return null;
  return (list as Array<{ id?: unknown; name?: unknown; model?: unknown }>)
    .map((entry) =>
      typeof entry === 'string'
        ? entry
        : typeof entry?.id === 'string'
          ? entry.id
          : typeof entry?.name === 'string'
            ? entry.name
            : typeof entry?.model === 'string'
              ? entry.model
              : null
    )
    .filter((id): id is string => Boolean(id));
}

/**
 * Test the AI connection: `GET {url}/models` with the given or stored settings.
 *
 * @route POST /api/settings/test-ai
 * @access Protected (requires authentication)
 */
export const testAiConnection = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: 'User not authenticated' }); return; }

  const body = (req.body ?? {}) as { ai_api_url?: unknown; ai_api_key?: unknown; ai_model?: unknown };

  let stored: { ai_api_url?: string | null; ai_api_key?: string | null; ai_model?: string | null } = {};
  try {
    const result = await getDbClient().query(
      'SELECT ai_api_url, ai_api_key, ai_model FROM settings WHERE user_id = $1',
      [userId]
    );
    stored = result.rows[0] ?? {};
  } catch (error) {
    logger.error('AI connection test: failed to load settings', { error: (error as Error)?.message, userId });
    res.status(500).json({ error: 'Failed to load settings', code: 'INTERNAL' });
    return;
  }

  const urlInput = pick<unknown>(body.ai_api_url, stored.ai_api_url);
  const apiKey = pickSecret(body.ai_api_key, stored.ai_api_key);
  const modelInput = pick<unknown>(body.ai_model, stored.ai_model);
  const model = typeof modelInput === 'string' && modelInput.trim() ? modelInput.trim() : null;

  const url = validateServiceUrl(urlInput);
  if (!url.ok || !url.value) {
    res.json({
      ok: false,
      code: 'INVALID_URL',
      message: url.ok ? 'No AI API URL configured' : 'Invalid AI API URL',
    });
    return;
  }

  const endpoint = `${url.value.replace(/\/+$/, '')}/models`;
  const started = Date.now();
  try {
    const response = await axios.get(endpoint, {
      timeout: CONNECTION_TEST_TIMEOUT_MS,
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      maxRedirects: 0,
      maxContentLength: 2 * 1024 * 1024,
      validateStatus: () => true,
    });
    const latencyMs = Date.now() - started;

    if (response.status === 401 || response.status === 403) {
      res.json({ ok: false, latencyMs, code: 'LLM_AUTH', message: 'The AI server rejected the API key' });
      return;
    }
    if (response.status < 200 || response.status >= 300) {
      logger.info(`AI connection test: /models answered HTTP ${response.status}`);
      res.json({
        ok: false,
        latencyMs,
        code: 'LLM_UNREACHABLE',
        message: `The AI server answered HTTP ${response.status} for /models — check the URL (it usually ends in /v1)`,
      });
      return;
    }

    const models = extractModelIds(response.data);
    const modelFound = model && models ? models.includes(model) : null;
    res.json({
      ok: true,
      latencyMs,
      ...(models ? { models: models.slice(0, MAX_LISTED_MODELS) } : {}),
      modelFound,
      ...(modelFound === false
        ? { code: 'LLM_MODEL', message: 'The configured model is not offered by the AI server' }
        : {}),
    });
  } catch (error) {
    const latencyMs = Date.now() - started;
    const failure = classifyUpstreamError(error);
    logger.info(`AI connection test failed (${failure.kind}${failure.code ? `, ${failure.code}` : ''})`);
    if (failure.kind === 'timeout') {
      res.json({ ok: false, latencyMs, code: 'LLM_TIMEOUT', message: 'The AI server did not answer within 5 seconds' });
      return;
    }
    res.json({ ok: false, latencyMs, code: 'LLM_UNREACHABLE', message: 'The AI server could not be reached' });
  }
};

/**
 * Test the speech-to-text connection: any HTTP answer below 500 from
 * `{url}/health` or `{url}` counts as reachable.
 *
 * @route POST /api/settings/test-stt
 * @access Protected (requires authentication)
 */
export const testSttConnection = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: 'User not authenticated' }); return; }

  const body = (req.body ?? {}) as { stt_api_url?: unknown; stt_api_key?: unknown };

  let stored: { stt_api_url?: string | null; stt_api_key?: string | null } = {};
  try {
    const result = await getDbClient().query(
      'SELECT stt_api_url, stt_api_key FROM settings WHERE user_id = $1',
      [userId]
    );
    stored = result.rows[0] ?? {};
  } catch (error) {
    logger.error('STT connection test: failed to load settings', { error: (error as Error)?.message, userId });
    res.status(500).json({ error: 'Failed to load settings', code: 'INTERNAL' });
    return;
  }

  const url = validateServiceUrl(pick<unknown>(body.stt_api_url, stored.stt_api_url));
  if (!url.ok || !url.value) {
    res.json({
      ok: false,
      code: 'INVALID_URL',
      message: url.ok ? 'No speech-to-text URL configured' : 'Invalid speech-to-text URL',
    });
    return;
  }
  const apiKey = pickSecret(body.stt_api_key, stored.stt_api_key);
  const base = url.value.replace(/\/+$/, '');

  const probe = async (target: string) => {
    const started = Date.now();
    try {
      const response = await axios.get(target, {
        timeout: CONNECTION_TEST_TIMEOUT_MS,
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        maxRedirects: 0,
        maxContentLength: 1024 * 1024,
        validateStatus: () => true,
        // Only the status matters; don't parse whatever the root page returns.
        responseType: 'text',
      });
      return { status: response.status, latencyMs: Date.now() - started };
    } catch (error) {
      return { failure: classifyUpstreamError(error), latencyMs: Date.now() - started };
    }
  };

  const health = await probe(`${base}/health`);
  if (health.status !== undefined && health.status < 500) {
    res.json({ ok: true, latencyMs: health.latencyMs });
    return;
  }

  // The host itself did not answer — asking it again for `/` would only
  // repeat the same failure.
  if (health.failure) {
    logger.info(`STT connection test failed (${health.failure.kind}${health.failure.code ? `, ${health.failure.code}` : ''})`);
    if (health.failure.kind === 'timeout') {
      res.json({ ok: false, latencyMs: health.latencyMs, code: 'STT_TIMEOUT', message: 'The speech-to-text server did not answer within 5 seconds' });
    } else {
      res.json({ ok: false, latencyMs: health.latencyMs, code: 'STT_UNREACHABLE', message: 'The speech-to-text server could not be reached' });
    }
    return;
  }

  const root = await probe(base);
  if (root.status !== undefined && root.status < 500) {
    res.json({ ok: true, latencyMs: root.latencyMs });
    return;
  }
  if (root.failure?.kind === 'timeout') {
    res.json({ ok: false, latencyMs: root.latencyMs, code: 'STT_TIMEOUT', message: 'The speech-to-text server did not answer within 5 seconds' });
    return;
  }
  res.json({
    ok: false,
    latencyMs: root.latencyMs,
    code: 'STT_UNREACHABLE',
    message:
      root.status !== undefined
        ? `The speech-to-text server answered HTTP ${root.status}`
        : 'The speech-to-text server could not be reached',
  });
};

/**
 * Test SMTP configuration by sending a test email.
 *
 * The SMTP password is write-only, so the settings form cannot send it back.
 * When the request names a host but no password, the stored password is used
 * — provided host and user are the stored ones.
 *
 * @route POST /api/settings/test-smtp
 * @access Protected (requires authentication)
 */
export const testSmtp = async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: 'User not authenticated' }); return; }

  const { to, host, port, user, pass, from, secure } = req.body;
  if (!to) { res.status(400).json({ error: 'Recipient email (to) is required' }); return; }

  try {
    // Use provided config if given, otherwise load from DB
    let config: SmtpConfig | null = null;
    if (host) {
      let password: string | undefined = pass || undefined;
      if (!password) {
        const stored = await getDbClient().query(
          'SELECT smtp_host, smtp_user, smtp_pass FROM settings WHERE user_id = $1',
          [userId]
        );
        const row = stored.rows[0];
        if (row?.smtp_pass && row.smtp_host === host && (row.smtp_user || '') === (user || '')) {
          password = row.smtp_pass;
        }
      }
      config = {
        host,
        port: port ?? 587,
        secure: secure ?? false,
        user: user || undefined,
        pass: password,
        from: from || user || 'noreply@opentyme.local',
      };
    } else {
      config = await getUserSmtpConfig(userId);
    }

    if (!config) {
      res.status(400).json({ error: 'No SMTP configuration found. Please configure SMTP settings first.' });
      return;
    }

    await emailService.sendTestEmail(config, to);
    res.json({ success: true, message: `Test email sent to ${to}` });
  } catch (error) {
    logger.error('SMTP test failed', { error: (error as Error)?.message, userId });
    res.status(500).json({ error: `SMTP test failed: ${(error as Error).message}` });
  }
};
