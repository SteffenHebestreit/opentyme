/**
 * AIChatWidget — floating chat FAB + panel, present on every authenticated page.
 * Only renders when ai_enabled is true in user settings.
 */

import React, { useState, useEffect, Component } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircle, X } from 'lucide-react';
import { useAIChat } from '../../api/hooks/useAIChat';
import AIChatPanel from './AIChatPanel';
import { getSettings } from '../../api/services/settings.service';
import { useAuth } from '../../contexts/AuthContext';

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

  return (
    <>
      {/* Floating panel */}
      {open && (
        <div
          className="fixed bottom-20 right-6 z-50 w-96 h-[600px] rounded-2xl shadow-2xl overflow-hidden border border-purple-500/20 dark:border-purple-400/20 flex flex-col backdrop-blur-sm"
          style={{ maxHeight: 'calc(100vh - 100px)' }}
        >
          <AIChatPanel
            messages={chat.messages}
            isStreaming={chat.isStreaming}
            error={chat.error}
            onSend={chat.sendMessage}
            onStop={chat.stopStreaming}
            onClear={chat.clearConversation}
            sttEnabled={sttEnabled}
          />
        </div>
      )}

      {/* FAB button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-[9999] w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-lg shadow-purple-500/30 flex items-center justify-center transition-all duration-200 active:scale-95"
        aria-label={open ? t('ai.close') : t('ai.open')}
      >
        {open ? (
          <X size={22} />
        ) : (
          <>
            <MessageCircle size={22} />
            {chat.isStreaming && (
              <span className="absolute top-1 right-1 w-3 h-3 rounded-full bg-pink-400 animate-pulse border-2 border-white" />
            )}
          </>
        )}
      </button>
    </>
  );
}

// ── Gate: only render when ai_enabled=true ───────────────────────────────────

export default function AIChatWidget() {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [sttEnabled, setSttEnabled] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    getSettings()
      .then((s) => {
        setAiEnabled(!!s.ai_enabled);
        setSttEnabled(!!s.stt_enabled);
      })
      .catch(() => setAiEnabled(false));
  }, [isAuthenticated]);

  // Not authenticated, still loading auth, or AI is disabled → don't render
  if (isLoadingAuth || !isAuthenticated || !aiEnabled) return null;

  return (
    <AIChatErrorBoundary>
      <AIChatWidgetInner sttEnabled={sttEnabled} />
    </AIChatErrorBoundary>
  );
}
