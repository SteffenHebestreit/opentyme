/**
 * Speech-to-text API service.
 * Records audio via MediaRecorder, uploads to /api/ai/transcribe,
 * returns the transcribed text.
 */

import { getAccessToken } from '../../services/auth/tokenManager';

const MAX_RECORDING_MS = 60_000; // 1 minute max
const AUDIO_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

function getSupportedMimeType(): string {
  for (const type of AUDIO_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

export interface RecordingHandle {
  stop: () => void;
}

/**
 * Start recording from the microphone.
 * Calls onTranscript with the transcribed text when done.
 * Calls onError on failure.
 * Returns a handle with a stop() method.
 */
export function startRecording(
  onTranscript: (text: string) => void,
  onError: (msg: string) => void,
  onStatusChange?: (active: boolean) => void
): RecordingHandle | null {
  if (!navigator.mediaDevices?.getUserMedia) {
    onError('Microphone access not supported in this browser');
    return null;
  }

  const mimeType = getSupportedMimeType();
  if (!mimeType) {
    onError('No supported audio format found in this browser');
    return null;
  }

  let recorder: MediaRecorder | null = null;
  let stopped = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  navigator.mediaDevices
    .getUserMedia({ audio: true, video: false })
    .then((stream) => {
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const chunks: Blob[] = [];
      recorder = new MediaRecorder(stream, { mimeType });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        onStatusChange?.(false);
        if (stopped && chunks.length === 0) return;

        const blob = new Blob(chunks, { type: mimeType });
        if (blob.size < 1000) {
          onError('Recording too short — please speak clearly');
          return;
        }

        try {
          const text = await uploadAudio(blob, mimeType);
          if (text) {
            onTranscript(text);
          } else {
            onError('No speech detected');
          }
        } catch (err: unknown) {
          onError(err instanceof Error ? err.message : String(err));
        }
      };

      recorder.start();
      onStatusChange?.(true);

      // Auto-stop after max recording time
      timeoutId = setTimeout(() => {
        if (recorder?.state === 'recording') recorder.stop();
      }, MAX_RECORDING_MS);
    })
    .catch((err: Error) => {
      onStatusChange?.(false);
      if (err.name === 'NotAllowedError') {
        onError('Microphone permission denied');
      } else {
        onError(`Microphone error: ${err.message}`);
      }
    });

  return {
    stop: () => {
      stopped = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (recorder?.state === 'recording') {
        recorder.stop();
      } else {
        onStatusChange?.(false);
      }
    },
  };
}

async function uploadAudio(blob: Blob, mimeType: string): Promise<string> {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const form = new FormData();
  const ext = mimeType.split('/')[1]?.split(';')[0] ?? 'webm';
  form.append('audio', blob, `recording.${ext}`);

  const response = await fetch('/api/ai/transcribe', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Transcription failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const data = await response.json() as { text?: string };
  return data.text?.trim() ?? '';
}
