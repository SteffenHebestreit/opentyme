import { FC, ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';
import { usePresence } from '../../hooks/ui/usePresence';

/**
 * Props for the Modal component.
 *
 * @property {boolean} open - Whether the dialog is shown
 * @property {string} [title] - Heading in the dialog header
 * @property {ReactNode} [description] - One line under the title
 * @property {ReactNode} [icon] - Element shown before the title
 * @property {ReactNode} [footer] - Actions; stays visible while the body scrolls
 * @property {() => void} onClose - Called on Escape, backdrop click and the close button
 * @property {'sm' | 'md' | 'lg' | 'xl' | 'full'} [size='md'] - Max width
 * @property {boolean} [closeOnBackdrop=true] - Close when the backdrop is clicked
 * @property {boolean} [closeOnEsc=true] - Close on Escape
 * @property {boolean} [showCloseButton=true] - Show the × in the header
 * @property {string} [labelledBy] - id of the element naming the dialog when it has no `title`
 * @property {string} [describedBy] - id of the element describing the dialog
 * @property {'dialog' | 'alertdialog'} [role='dialog'] - `alertdialog` for confirmations that interrupt
 */
interface ModalProps {
  open: boolean;
  title?: string;
  description?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
  showCloseButton?: boolean;
  labelledBy?: string;
  describedBy?: string;
  role?: 'dialog' | 'alertdialog';
  className?: string;
  bodyClassName?: string;
}

const sizeClass: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-2xl',
  lg: 'sm:max-w-4xl',
  xl: 'sm:max-w-6xl',
  full: 'sm:max-w-[min(96vw,1600px)]',
};

/* Open dialogs, innermost last — only the top one reacts to Escape. */
const openStack: string[] = [];
let scrollLocks = 0;
let previousOverflow = '';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible dialog with enter/exit animation.
 *
 * - Escape and backdrop click close it (only the top-most when dialogs are stacked)
 * - Focus moves into the dialog, Tab stays inside, and returns to the opener on close
 * - Page scroll is locked while any dialog is open
 * - Content is kept for the exit animation, so it doesn't collapse while fading out
 */
export const Modal: FC<ModalProps> = ({
  open,
  title,
  description,
  icon,
  children,
  footer,
  onClose,
  size = 'md',
  closeOnBackdrop = true,
  closeOnEsc = true,
  showCloseButton = true,
  labelledBy,
  describedBy,
  role = 'dialog',
  className,
  bodyClassName,
}) => {
  const { t } = useTranslation('common');
  const { mounted, closing } = usePresence(open, 150);
  const id = useId();
  const titleId = `${id}-title`;
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Freeze what is shown while the exit animation runs
  const lastContent = useRef({ children, footer, title, description });
  if (open) lastContent.current = { children, footer, title, description };
  const shown = open ? { children, footer, title, description } : lastContent.current;

  // Stack, Escape, focus handling
  useEffect(() => {
    if (!open) return;
    openStack.push(id);
    const opener = document.activeElement as HTMLElement | null;

    const focusFrame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel || panel.contains(document.activeElement)) return;
      const preferred = panel.querySelector<HTMLElement>('[autofocus], [data-autofocus]');
      (preferred ?? panel).focus({ preventScroll: true });
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (openStack[openStack.length - 1] !== id) return;
      // A menu or select inside the dialog that handled Escape itself calls preventDefault
      if (event.key === 'Escape' && closeOnEsc && !event.defaultPrevented) {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key === 'Tab' && panelRef.current) {
        const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
          (el) => el.offsetParent !== null
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          last.focus();
          event.preventDefault();
        } else if (!event.shiftKey && document.activeElement === last) {
          first.focus();
          event.preventDefault();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', onKeyDown);
      const index = openStack.lastIndexOf(id);
      if (index !== -1) openStack.splice(index, 1);
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [open, id, closeOnEsc]);

  // Scroll lock (counted, so nested dialogs restore correctly)
  useEffect(() => {
    if (!open) return;
    if (scrollLocks === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    scrollLocks += 1;
    return () => {
      scrollLocks -= 1;
      if (scrollLocks === 0) document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!mounted) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div
        className={cn(
          'absolute inset-0 bg-gray-950/40 backdrop-blur-[2px] dark:bg-black/60',
          closing ? 'animate-fade-out' : 'animate-fade-in'
        )}
        onClick={closeOnBackdrop ? () => onCloseRef.current() : undefined}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          'relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-overlay outline-none focus-visible:ring-0 focus-visible:ring-offset-0',
          'sm:max-h-[min(90dvh,960px)] sm:rounded-2xl',
          'dark:border-gray-800 dark:bg-gray-900',
          closing ? 'animate-scale-out' : 'animate-scale-in',
          sizeClass[size],
          className
        )}
        role={role}
        aria-modal="true"
        aria-labelledby={shown.title ? titleId : labelledBy}
        aria-label={shown.title || labelledBy ? undefined : t('common.dialog', 'Dialog')}
        aria-describedby={describedBy}
      >
        {(shown.title || showCloseButton) && (
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-100 px-6 py-4 dark:border-gray-800">
            <div className="flex min-w-0 items-center gap-3">
              {icon && (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/10 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-400/20">
                  {icon}
                </span>
              )}
              <div className="min-w-0">
                {shown.title && (
                  <h2 id={titleId} className="truncate text-base font-semibold tracking-tight text-gray-900 dark:text-white">
                    {shown.title}
                  </h2>
                )}
                {shown.description && (
                  <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{shown.description}</p>
                )}
              </div>
            </div>
            {showCloseButton && (
              <button
                type="button"
                className="-mr-2 -mt-1 rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-white/5 dark:hover:text-gray-200"
                aria-label={t('buttons.close', 'Close')}
                onClick={() => onCloseRef.current()}
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        )}
        <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5', bodyClassName)}>
          {shown.children}
        </div>
        {shown.footer && (
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-gray-100 bg-gray-50/70 px-6 py-3.5 sm:flex-row sm:items-center sm:justify-end dark:border-gray-800 dark:bg-gray-900/60">
            {shown.footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default Modal;
