/**
 * AIChatWidget — floating chat FAB + panel, present on every authenticated page.
 * Only renders when ai_enabled is true in user settings.
 */

import React, { useState, useEffect, useRef, Component } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sparkles, X } from 'lucide-react';
import { useAIChat } from '../../api/hooks/useAIChat';
import AIChatPanel from './AIChatPanel';
import { getSettings } from '../../api/services/settings.service';
import { useAuth } from '../../contexts/AuthContext';
import { usePresence } from '../../hooks/ui/usePresence';
import { cn } from '../../lib/cn';

// ── Error boundary to isolate widget crashes ─────────────────────────────────

class AIChatErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('[AIChatWidget] Render error:', error);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

// ── Inner widget (only rendered when ai_enabled=true) ────────────────────────

function AIChatWidgetInner({ sttEnabled }: { sttEnabled: boolean }) {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const chat = useAIChat();
  const { mounted, closing } = usePresence(open, 160);
  const fabRef = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    fabRef.current?.focus({ preventScroll: true });
  };

  // Escape closes the panel — unless something inside (a menu, a dialog) handled it
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector('[role="dialog"][aria-modal="true"]')) {
        setOpen(false);
        fabRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const approvalWaiting = !!chat.pendingApproval && chat.pendingApproval.actions.length > 0 && !chat.isStreaming;

  return (
    <>
      {mounted && (
        <>
          {/* Backdrop behind the bottom sheet on small screens */}
          <div
            className={cn(
              'fixed inset-0 z-40 bg-gray-950/40 backdrop-blur-[2px] sm:hidden dark:bg-black/60',
              closing ? 'animate-fade-out' : 'animate-fade-in'
            )}
            onClick={close}
            aria-hidden="true"
          />

          {/* Floating panel — bottom sheet on mobile, card above the button from sm up */}
          <div
            role="dialog"
            aria-label={t('ai.title')}
            className={cn(
              'fixed z-40 flex flex-col overflow-hidden border border-gray-200 bg-white shadow-overlay dark:border-gray-800 dark:bg-gray-900',
              'inset-x-0 bottom-0 h-[85dvh] origin-bottom rounded-t-2xl pb-[env(safe-area-inset-bottom)]',
              'sm:inset-x-auto sm:bottom-[5.5rem] sm:right-6 sm:h-[min(640px,calc(100dvh-8rem))] sm:w-[400px] sm:origin-bottom-right sm:rounded-xl sm:pb-0',
              closing ? 'animate-scale-out' : 'animate-scale-in'
            )}
          >
            <AIChatPanel
              messages={chat.messages}
              isStreaming={chat.isStreaming}
              error={chat.error}
              onSend={chat.sendMessage}
              onStop={chat.stopStreaming}
              onClear={chat.clearConversation}
              sttEnabled={sttEnabled}
              pendingApproval={chat.pendingApproval}
              onApprove={chat.approve}
              onClose={close}
              onRetryMessage={chat.retryMessage}
              restoreFailed={chat.restoreFailed}
              onRetryRestore={chat.retryRestore}
              onDismissError={chat.dismissError}
            />
          </div>
        </>
      )}

      {/* FAB button (hidden on mobile while the sheet is open — the sheet has its own close button) */}
      <button
        ref={fabRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-purple-600 text-white shadow-lifted',
          'transition-[background-color,transform] duration-200 hover:bg-purple-500 active:scale-95',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950',
          open && 'max-sm:hidden'
        )}
        aria-label={
          open ? t('ai.close') : approvalWaiting ? `${t('ai.open')} — ${t('ai.approvalWaiting', 'changes are waiting for your approval')}` : t('ai.open')
        }
        aria-expanded={open}
      >
        <Sparkles
          className={cn(
            'absolute h-[22px] w-[22px] transition-[transform,opacity] duration-200 ease-out-expo',
            open ? 'rotate-90 scale-50 opacity-0' : 'rotate-0 scale-100 opacity-100'
          )}
          aria-hidden="true"
        />
        <X
          className={cn(
            'absolute h-[22px] w-[22px] transition-[transform,opacity] duration-200 ease-out-expo',
            open ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-50 opacity-0'
          )}
          aria-hidden="true"
        />
        {!open && chat.isStreaming && (
          <span className="absolute right-0.5 top-0.5 h-3 w-3 animate-soft-pulse rounded-full border-2 border-white bg-emerald-400 dark:border-gray-950" />
        )}
        {!open && approvalWaiting && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[1.25rem] animate-pop-in items-center justify-center rounded-full border-2 border-white bg-amber-500 px-1 text-[10px] font-bold text-white dark:border-gray-950"
            aria-hidden="true"
          >
            {chat.pendingApproval?.actions.length}
          </span>
        )}
      </button>
    </>
  );
}

// ── Gate: only render when ai_enabled=true ───────────────────────────────────

export default function AIChatWidget() {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  // Through React Query: saving the settings refreshes this (lib/dataSync), so
  // switching AI or speech input on/off applies without a reload.
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });
  const aiEnabled = !!settings?.ai_enabled;
  const sttEnabled = !!settings?.stt_enabled;

  // Not authenticated, still loading auth, or AI is disabled → don't render
  if (isLoadingAuth || !isAuthenticated || !aiEnabled) return null;

  return (
    <AIChatErrorBoundary>
      <AIChatWidgetInner sttEnabled={sttEnabled} />
    </AIChatErrorBoundary>
  );
}
