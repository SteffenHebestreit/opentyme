/**
 * @fileoverview Promise-based confirmation dialog — the styled replacement for
 * `window.confirm()`.
 *
 *   if (!(await confirmDialog({ title: t('confirmDelete'), tone: 'danger' }))) return;
 *
 * Rendered by <ConfirmHost /> in the app shell.
 */

import type { ReactNode } from 'react';
import { create } from 'zustand';

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  /** Defaults to the translated "Confirm" (or "Delete" for tone 'danger') */
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
}

interface ConfirmRequest extends ConfirmOptions {
  id: number;
  resolve: (confirmed: boolean) => void;
}

interface ConfirmState {
  request: ConfirmRequest | null;
  open: boolean;
  settle: (confirmed: boolean) => void;
}

let nextId = 1;

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  request: null,
  open: false,
  settle: (confirmed) => {
    const { request } = get();
    if (!request) return;
    request.resolve(confirmed);
    // keep `request` so the dialog's exit animation still has its text
    set({ open: false });
  },
}));

/** Ask the user to confirm. Resolves true on confirm, false on cancel / Escape. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  // A question already on screen counts as cancelled when a new one replaces it
  useConfirmStore.getState().request?.resolve(false);
  return new Promise<boolean>((resolve) => {
    useConfirmStore.setState({ request: { ...options, id: nextId++, resolve }, open: true });
  });
}
