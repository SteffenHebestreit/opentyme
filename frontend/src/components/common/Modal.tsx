import React, { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import { Modal as Dialog } from '../ui/Modal';
import { Button } from './Button';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

/**
 * Props for the Modal component (isOpen-style API kept for existing callers).
 *
 * New code can use `components/ui/Modal` directly — this is a thin adapter onto it.
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

/* This API's sizes were one step narrower than the dialog's */
const sizeMap: Record<ModalSize, 'sm' | 'md' | 'lg' | 'xl' | 'full'> = {
  sm: 'sm',
  md: 'sm',
  lg: 'md',
  xl: 'md',
  full: 'full',
};

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
}) => (
  <Dialog
    open={isOpen}
    onClose={onClose}
    title={title}
    footer={footer}
    size={sizeMap[size]}
    closeOnBackdrop={closeOnOverlayClick}
    closeOnEsc={closeOnEsc}
    showCloseButton={showCloseButton}
    icon={Icon ? <Icon className="h-5 w-5" /> : undefined}
    className={className}
  >
    {children}
  </Dialog>
);

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
 * Confirmation dialog with cancel / confirm buttons.
 *
 * For a one-off question in an event handler, `confirmDialog()` from
 * `lib/confirm` is simpler — it returns a promise.
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
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title={title}
    size="sm"
    footer={
      <>
        <Button variant="secondary" onClick={onClose} disabled={loading} type="button">
          {cancelText}
        </Button>
        <Button variant={variant === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} isLoading={loading} type="button">
          {confirmText}
        </Button>
      </>
    }
  >
    <div className="text-sm text-gray-600 dark:text-gray-300">{children}</div>
  </Modal>
);
