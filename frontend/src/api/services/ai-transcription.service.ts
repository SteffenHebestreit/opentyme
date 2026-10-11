/**
 * Speech-to-text API service.
 * Records audio via MediaRecorder, uploads to /api/ai/transcribe,
 * returns the transcribed text.
 */

import { getFreshAccessToken } from '../../services/auth/freshToken';
import i18n from '../../i18n/config';

const MAX_RECORDING_MS = 60_000; // 1 minute max
const UPLOAD_TIMEOUT_MS = 90_000;
const AUDIO_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

/** idle → starting (permission prompt) → recording → transcribing → idle */
export type RecordingStatus = 'idle' | 'starting' | 'recording' | 'transcribing';

export interface RecordingHandle {
  /** Stop recording and transcribe what was said */
  stop: () => void;
  /** Stop and throw the audio away (panel closed) — releases the microphone */
  cancel: () => void;
}

export interface TranscriptionError {
  message: string;
  /** Upload the same recording again (only when the recording itself was fine) */
  retry?: () => void;
}

const t = (key: string, fallback: string, options?: Record<string, unknown>) =>
  i18n.t(`common:ai.speech.${key}`, { defaultValue: fallback, ...options }) as string;

function getSupportedMimeType(): string {
  for (const type of AUDIO_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

export function startRecording(
  onTranscript: (text: string) => void,
  onError: (error: TranscriptionError) => void,
  onStatusChange?: (status: RecordingStatus) => void
): RecordingHandle | null {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    onError({ message: t('unsupported', 'Microphone access is not supported in this browser.') });
    return null;
  }

  const mimeType = getSupportedMimeType();
  if (!mimeType) {
    onError({ message: t('noFormat', 'This browser cannot record a supported audio format.') });
    return null;
  }

  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let finished = false; // stop or cancel requested
  let discard = false; // cancel: drop the audio
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const releaseMicrophone = () => {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
  };

  const transcribe = async (blob: Blob) => {
    onStatusChange?.('transcribing');
    try {
      const text = await uploadAudio(blob, mimeType);
      onStatusChange?.('idle');
      if (text) onTranscript(text);
      else onError({ message: t('noSpeech', 'No speech detected — please try again.') });
    } catch (err: unknown) {
      onStatusChange?.('idle');
      onError({
        message: err instanceof Error ? err.message : String(err),
        retry: () => void transcribe(blob),
      });
    }
  };

  onStatusChange?.('starting');

  navigator.mediaDevices
    .getUserMedia({ audio: true, video: false })
    .then((mediaStream) => {
      stream = mediaStream;
      if (finished) {
        // Stopped or closed while the permission prompt was open
        releaseMicrophone();
        onStatusChange?.('idle');
        return;
      }

      const chunks: Blob[] = [];
      recorder = new MediaRecorder(mediaStream, { mimeType });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        releaseMicrophone();
        if (timeoutId) clearTimeout(timeoutId);
        if (discard) {
          onStatusChange?.('idle');
          return;
        }
        const blob = new Blob(chunks, { type: mimeType });
        if (blob.size < 1000) {
          onStatusChange?.('idle');
          onError({ message: t('tooShort', 'Recording too short — please speak a little longer.') });
          return;
        }
        void transcribe(blob);
      };

      recorder.start();
      onStatusChange?.('recording');

      // Auto-stop after max recording time
      timeoutId = setTimeout(() => {
        if (recorder?.state === 'recording') recorder.stop();
      }, MAX_RECORDING_MS);
    })
    .catch((err: Error) => {
      onStatusChange?.('idle');
      if (finished) return;
      if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
        onError({ message: t('denied', 'Microphone access was denied. Allow it in the browser to use voice input.') });
      } else if (err.name === 'NotFoundError') {
        onError({ message: t('noMicrophone', 'No microphone found.') });
      } else {
        onError({ message: t('micError', 'The microphone could not be started.') });
      }
    });

  const end = (dropAudio: boolean) => {
    if (finished) return;
    finished = true;
    discard = dropAudio;
    if (timeoutId) clearTimeout(timeoutId);
    if (recorder?.state === 'recording') {
      recorder.stop(); // onstop releases the microphone
    } else {
      releaseMicrophone();
      if (!recorder) return; // permission prompt still open — the .then() above cleans up
      onStatusChange?.('idle');
    }
  };

  return {
    stop: () => end(false),
    cancel: () => end(true),
  };
}

async function uploadAudio(blob: Blob, mimeType: string): Promise<string> {
  const form = new FormData();
  const ext = mimeType.split('/')[1]?.split(';')[0] ?? 'webm';
  form.append('audio', blob, `recording.${ext}`);

  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), UPLOAD_TIMEOUT_MS);
  try {
    let response: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      // fetch bypasses the axios interceptor — refresh the token here
      const token = await getFreshAccessToken(30, attempt > 0);
      if (!token) throw new Error(t('auth', 'Your session has expired — please reload the page.'));
      response = await fetch('/api/ai/transcribe', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
        signal: timeout.signal,
      });
      if (response.status !== 401) break;
    }

    if (!response || !response.ok) {
      let body: { error?: string; code?: string } = {};
      try {
        body = (await response?.json()) ?? {};
      } catch {
        // not JSON
      }
      if (body.code === 'STT_UNREACHABLE') {
        throw new Error(t('unreachable', 'The speech recognition service is not reachable. Check the speech-to-text settings.'));
      }
      if (body.code === 'STT_DISABLED') {
        throw new Error(t('disabled', 'Speech-to-text is switched off in the settings.'));
      }
      if (body.code === 'STT_TIMEOUT') {
        throw new Error(t('timeout', 'Speech recognition took too long. Please try again.'));
      }
      if (body.code === 'NO_AUDIO') {
        throw new Error(t('noSpeech', 'No speech detected — please try again.'));
      }
      if (body.code === 'INVALID_AUDIO') {
        throw new Error(t('invalidAudio', 'The recording could not be processed. Please try again.'));
      }
      if (response?.status === 401 || response?.status === 403) {
        throw new Error(t('auth', 'Your session has expired — please reload the page.'));
      }
      throw new Error(t('failed', 'Transcription failed (error {{status}}).', { status: response?.status ?? 0 }));
    }

    const data = (await response.json()) as { text?: string };
    return data.text?.trim() ?? '';
  } catch (err: unknown) {
    if ((err as Error)?.name === 'AbortError') {
      throw new Error(t('timeout', 'Speech recognition took too long. Please try again.'));
    }
    if (err instanceof TypeError) {
      throw new Error(t('network', 'Connection to the server failed.'));
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
