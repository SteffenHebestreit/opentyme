/**
 * Speech-to-Text transcription service.
 * Supports fast-whisper and Qwen3 ASR via OpenAI-compatible /audio/transcriptions endpoint.
 * Falls back to the same AI provider configured in user settings.
 */

import { logger } from '../../utils/logger';
import { pool } from '../../utils/database';

interface TranscriptionSettings {
  stt_enabled: boolean;
  stt_provider: string;       // 'whisper' | 'qwen_asr' | 'custom'
  stt_api_url: string;        // e.g. http://localhost:8080 (fast-whisper server)
  stt_api_key: string;
  stt_model: string;          // e.g. 'base', 'large-v3', 'qwen2-audio-instruct'
  stt_language: string;       // e.g. 'de', 'en', '' = auto-detect
}

interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
}

const DEFAULT_SETTINGS: TranscriptionSettings = {
  stt_enabled: false,
  stt_provider: 'whisper',
  stt_api_url: 'http://localhost:8080',
  stt_api_key: '',
  stt_model: 'large-v3',
  stt_language: '',
};

// Guardrails
const MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
const SUPPORTED_MIME_TYPES = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav', 'audio/flac'];
const sttTimeoutMs = (): number => Number(process.env.STT_TIMEOUT_MS) || 60_000;

// ---- Errors --------------------------------------------------------------------

/** Stable error codes of POST /api/ai/transcribe (the frontend translates by code). */
export type SttErrorCode = 'STT_DISABLED' | 'STT_UNREACHABLE' | 'STT_TIMEOUT' | 'STT_FAILED' | 'INVALID_AUDIO';

const STT_ERRORS: Record<SttErrorCode, { status: number; message: string }> = {
  STT_DISABLED: { status: 400, message: 'Speech-to-text is not enabled. Please configure it in Settings → AI.' },
  STT_UNREACHABLE: { status: 503, message: 'The speech-to-text server could not be reached.' },
  STT_TIMEOUT: { status: 504, message: 'The speech-to-text server did not respond in time.' },
  STT_FAILED: { status: 502, message: 'The speech-to-text server could not transcribe the audio.' },
  INVALID_AUDIO: { status: 400, message: 'The audio file is not supported.' },
};

/** A classified transcription failure; `message` is safe to show to clients. */
export class TranscriptionError extends Error {
  readonly code: SttErrorCode;
  readonly status: number;

  constructor(code: SttErrorCode, message?: string) {
    super(message ?? STT_ERRORS[code].message);
    this.name = 'TranscriptionError';
    this.code = code;
    this.status = STT_ERRORS[code].status;
  }
}

const NETWORK_CODES = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ECONNRESET',
  'EPIPE',
  'ERR_INVALID_URL',
  'UND_ERR_SOCKET',
]);
const TIMEOUT_CODES = new Set(['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT']);

/**
 * Maps a fetch failure to an STT error code. Node's fetch (undici) wraps the
 * socket error: `TypeError: fetch failed` with the real code in `err.cause.code`
 * (or inside `err.cause.errors[]` for multi-address connection attempts).
 */
export function classifySttError(err: unknown): SttErrorCode {
  if (err instanceof TranscriptionError) return err.code;
  const e = err as {
    name?: string;
    code?: string;
    cause?: { name?: string; code?: string; errors?: Array<{ code?: string }> };
  };
  if (e?.name === 'AbortError' || e?.name === 'TimeoutError' || e?.cause?.name === 'TimeoutError') return 'STT_TIMEOUT';
  const codes = [e?.cause?.code, e?.code, ...(e?.cause?.errors ?? []).map((x) => x?.code)].filter(
    (c): c is string => typeof c === 'string'
  );
  if (codes.some((c) => TIMEOUT_CODES.has(c))) return 'STT_TIMEOUT';
  if (codes.some((c) => NETWORK_CODES.has(c))) return 'STT_UNREACHABLE';
  return 'STT_FAILED';
}

export class TranscriptionService {
  async getUserSettings(userId: string): Promise<TranscriptionSettings> {
    try {
      const db = pool();
      const result = await db.query(
        `SELECT stt_enabled, stt_provider, stt_api_url, stt_api_key, stt_model, stt_language
         FROM settings WHERE user_id = $1`,
        [userId]
      );
      if (result.rows.length === 0) return DEFAULT_SETTINGS;
      // Per-field defaults: a spread would let NULL columns override them
      // (a NULL stt_api_url used to crash on .replace()).
      const row = result.rows[0] as Partial<Record<keyof TranscriptionSettings, string | boolean | null>>;
      const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
      return {
        stt_enabled: row.stt_enabled === true,
        stt_provider: text(row.stt_provider) || DEFAULT_SETTINGS.stt_provider,
        stt_api_url: text(row.stt_api_url) || DEFAULT_SETTINGS.stt_api_url,
        stt_api_key: typeof row.stt_api_key === 'string' ? row.stt_api_key : DEFAULT_SETTINGS.stt_api_key,
        // '' → the request falls back to 'whisper-1' below (unchanged behaviour)
        stt_model: text(row.stt_model),
        stt_language: text(row.stt_language),
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  async transcribe(
    audioBuffer: Buffer,
    mimeType: string,
    userId: string
  ): Promise<TranscriptionResult> {
    // Guardrails
    if (audioBuffer.length > MAX_AUDIO_SIZE_BYTES) {
      throw new TranscriptionError('INVALID_AUDIO', `Audio file too large (max ${MAX_AUDIO_SIZE_BYTES / 1024 / 1024} MB)`);
    }
    if (!SUPPORTED_MIME_TYPES.includes(mimeType)) {
      throw new TranscriptionError('INVALID_AUDIO', 'Unsupported audio format');
    }

    const settings = await this.getUserSettings(userId);
    if (!settings.stt_enabled) {
      throw new TranscriptionError('STT_DISABLED');
    }

    const apiUrl = settings.stt_api_url.replace(/\/$/, '');
    const apiKey = settings.stt_api_key;
    const language = settings.stt_language || undefined;
    // Providers using tts-stt-playground native /transcribe format (field: 'audio')
    const isNativeEndpoint = settings.stt_provider === 'qwen_asr' || settings.stt_provider === 'faster_whisper';

    const ext = mimeType.split('/')[1]?.split(';')[0] ?? 'webm';
    const form = new FormData();
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });

    // native: /transcribe endpoint — field name 'audio' (qwen_asr, faster_whisper)
    // others: OpenAI-compatible /v1/audio/transcriptions — field name 'file'
    const endpoint = isNativeEndpoint
      ? `${apiUrl}/transcribe`
      : `${apiUrl}/v1/audio/transcriptions`;

    if (isNativeEndpoint) {
      form.append('audio', blob, `audio.${ext}`);
      if (language) form.append('language', language);
      form.append('task', 'transcribe');
      // Raise VAD no-speech threshold so webm/opus recordings aren't filtered out
      form.append('no_speech_threshold', '0.95');
    } else {
      form.append('file', blob, `audio.${ext}`);
      if (language) form.append('language', language);
      form.append('model', settings.stt_model || 'whisper-1');
      form.append('response_format', 'json');
    }

    // The abort timer stays armed until the response BODY has been read — a
    // server that sends headers and then stalls must not hang the request.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), sttTimeoutMs());
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: form,
        signal: controller.signal,
      });

      if (!response.ok) {
        // Logged (truncated) for diagnosis — never echoed to the client.
        const errText = await response.text().catch(() => '');
        logger.error(
          `[STT] Upstream returned HTTP ${response.status}: ${errText.replace(/\s+/g, ' ').slice(0, 200)}`
        );
        throw new TranscriptionError('STT_FAILED');
      }

      let data: { text?: unknown; language?: string; duration?: number };
      try {
        data = (await response.json()) as typeof data;
      } catch (parseErr: unknown) {
        if (classifySttError(parseErr) === 'STT_TIMEOUT') throw parseErr;
        logger.error('[STT] Upstream returned a non-JSON body');
        throw new TranscriptionError('STT_FAILED');
      }
      const text = typeof data?.text === 'string' ? data.text.trim() : '';
      logger.debug(`[STT] Transcribed ${audioBuffer.length} bytes (${text.length} chars)`);

      return {
        text,
        language: data.language,
        duration: data.duration,
      };
    } catch (error: unknown) {
      if (error instanceof TranscriptionError) throw error;
      const code = classifySttError(error);
      const cause = (error as { cause?: { code?: string } })?.cause?.code;
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[STT] Transcription error (${code}): ${message}${cause ? ` [${cause}]` : ''}`);
      throw new TranscriptionError(code);
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const transcriptionService = new TranscriptionService();
