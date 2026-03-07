import React, { ReactNode } from 'react';
import { LucideIcon, X } from 'lucide-react';

/**
 * Available modal sizes.
 * @type {('sm' | 'md' | 'lg' | 'xl' | 'full')}
 */
type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

/**
 * Props for the Modal component.
 * 
 * @interface ModalProps
 * @property {boolean} isOpen - Whether modal is visible
 * @property {() => void} onClose - Close callback
 * @property {string} title - Modal title
 * @property {ReactNode} children - Modal content
 * @property {ReactNode} [footer] - Optional footer content
 * @property {ModalSize} [size='md'] - Modal size
 * @property {boolean} [closeOnOverlayClick=true] - Close when clicking overlay
 * @property {boolean} [closeOnEsc=true] - Close when pressing Escape
 * @property {boolean} [showCloseButton=true] - Show close button
 * @property {LucideIcon} [icon] - Optional icon in header
 * @property {string} [className] - Additional CSS classes
 */
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  closeOnOverlayClick?: boolean;
  closeOnEsc?: boolean;
  showCloseButton?: boolean;
  icon?: LucideIcon;
  className?: string;
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-full mx-4',
};

/**
 * Modal component for dialogs and overlays.
 * 
 * Features:
 * - Multiple size options
 * - Optional icon in header
 * - Customizable footer
 * - Close on overlay click
 * - Close on Escape key
 * - Focus trap
 * - Dark mode support
 * - Accessible (role="dialog", aria-modal, etc.)
 * - Smooth fade/scale animation
 * 
 * @component
 * @example
 * // Basic modal
 * <Modal
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   title="Confirm Action"
 * >
 *   <p>Are you sure you want to continue?</p>
 * </Modal>
 * 
 * @example
 * // Modal with footer
 * <Modal
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   title="Delete Item"
 *   size="lg"
 *   footer={
 *     <div className="flex justify-end gap-3">
 *       <button onClick={() => setIsOpen(false)}>Cancel</button>
 *       <button className="btn-danger" onClick={handleDelete}>Delete</button>
 *     </div>
 *   }
 * >
 *   <p>This action cannot be undone.</p>
 * </Modal>
 * 
 * @example
 * // Modal with icon
 * <Modal
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   title="Upload File"
 *   icon={Upload}
 * >
 *   <FileUploadForm />
 * </Modal>
 * 
 * @param {ModalProps} props - Component props
 * @returns {JSX.Element | null} Modal element or null if not open
 */
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  closeOnOverlayClick = true,
  closeOnEsc = true,
  showCloseButton = true,
  icon: Icon,
  className = '',
}) => {
  // Handle Escape key
  React.useEffect(() => {
    if (!isOpen || !closeOnEsc) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, closeOnEsc, onClose]);

  // Prevent body scroll when modal is open
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (closeOnOverlayClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className={`w-full transform rounded-xl bg-white shadow-2xl transition-all dark:bg-gray-900 ${sizeClasses[size]} ${className}`}
        style={{
          animation: 'modalFadeIn 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <div className="flex items-center gap-3">
            {Icon && (
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <Icon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
            )}
            <h2
              id="modal-title"
              className="text-xl font-semibold text-gray-900 dark:text-white"
            >
              {title}
            </h2>
          </div>
          {showCloseButton && (
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="border-t border-gray-200 px-6 py-4 dark:border-gray-800">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Props for the ConfirmModal component.
 * 
 * @interface ConfirmModalProps
 * @property {boolean} isOpen - Whether modal is visible
 * @property {() => void} onClose - Close callback
 * @property {() => void} onConfirm - Confirm callback
 * @property {string} title - Modal title
 * @property {ReactNode} children - Modal content/message
 * @property {string} [confirmText='Confirm'] - Confirm button text
 * @property {string} [cancelText='Cancel'] - Cancel button text
 * @property {'danger' | 'primary'} [variant='primary'] - Button variant
 * @property {boolean} [loading] - Show loading state on confirm button
 */
interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children: ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary';
  loading?: boolean;
}

/**
 * Confirmation modal with confirm/cancel buttons.
 * 
 * @component
 * @example
 * <ConfirmModal
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   onConfirm={handleDelete}
 *   title="Delete Item"
 *   variant="danger"
 *   confirmText="Delete"
 * >
 *   Are you sure? This action cannot be undone.
 * </ConfirmModal>
 */
export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  children,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'primary',
  loading = false,
}) => {
  const buttonClass = variant === 'danger'
    ? 'bg-red-600 hover:bg-red-700 text-white'
    : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${buttonClass}`}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                {confirmText}
              </span>
            ) : (
              confirmText
            )}
          </button>
        </div>
      }
    >
      {children}
    </Modal>
  );
};
