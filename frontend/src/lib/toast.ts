/**
 * @fileoverview Toast notifications.
 *
 * Call from anywhere — components, hooks, plain functions:
 *
 *   toast.success(t('messages.saveSuccess'));
 *   toast.error('Could not send', { description: error.message });
 *
 * Rendered by <Toaster /> in the app shell.
 */

import { create } from 'zustand';

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
  duration: number;
  leaving: boolean;
}

interface ToastOptions {
  description?: string;
  /** ms until it disappears; errors stay a little longer by default */
  duration?: number;
}

interface ToastState {
  toasts: ToastItem[];
  push: (tone: ToastTone, title: string, options?: ToastOptions) => number;
  dismiss: (id: number) => void;
  remove: (id: number) => void;
}

const MAX_VISIBLE = 4;
const EXIT_MS = 180;
let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (tone, title, options) => {
    const id = nextId++;
    const duration = options?.duration ?? (tone === 'error' ? 6500 : 4000);
    set((state) => ({
      toasts: [...state.toasts, { id, tone, title, description: options?.description, duration, leaving: false }].slice(-MAX_VISIBLE),
    }));
    if (duration > 0) setTimeout(() => get().dismiss(id), duration);
    return id;
  },
  dismiss: (id) => {
    if (!get().toasts.some((item) => item.id === id && !item.leaving)) return;
    set((state) => ({
      toasts: state.toasts.map((item) => (item.id === id ? { ...item, leaving: true } : item)),
    }));
    setTimeout(() => get().remove(id), EXIT_MS);
  },
  remove: (id) => set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) })),
}));

const push = (tone: ToastTone) => (title: string, options?: ToastOptions) =>
  useToastStore.getState().push(tone, title, options);

export const toast = {
  success: push('success'),
  error: push('error'),
  info: push('info'),
  warning: push('warning'),
  dismiss: (id: number) => useToastStore.getState().dismiss(id),
};
