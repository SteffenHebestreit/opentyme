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
      return { ...DEFAULT_SETTINGS, ...result.rows[0] };
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
      throw new Error(`Audio file too large (max ${MAX_AUDIO_SIZE_BYTES / 1024 / 1024} MB)`);
    }
    if (!SUPPORTED_MIME_TYPES.includes(mimeType)) {
      throw new Error(`Unsupported audio format: ${mimeType}`);
    }

    const settings = await this.getUserSettings(userId);
    if (!settings.stt_enabled) {
      throw new Error('Speech-to-text is not enabled. Please configure it in Settings → AI.');
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

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: form,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`STT API returned ${response.status}: ${errText.slice(0, 200)}`);
      }

      const data = await response.json() as { text?: string; language?: string; duration?: number };
      const text = data.text?.trim() ?? '';
      logger.debug(`[STT] Transcribed ${audioBuffer.length} bytes → "${text.slice(0, 80)}"`);

      return {
        text,
        language: data.language,
        duration: data.duration,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[STT] Transcription error: ${message}`);
      throw new Error(`Transcription failed: ${message}`);
    }
  }
}

export const transcriptionService = new TranscriptionService();
