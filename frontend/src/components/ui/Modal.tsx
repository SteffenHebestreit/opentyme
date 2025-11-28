import { FC, ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import clsx from 'clsx';

/**
 * Modal component for displaying overlay dialogs and forms.
 *
 * **Features:**
 * - Portal-based rendering to `document.body`
 * - Backdrop overlay with blur effect
 * - Configurable sizes (sm, md, lg, xl)
 * - Keyboard support (Escape to close)
 * - Body scroll lock when open
 * - Optional header and footer sections
 * - ARIA accessibility attributes
 * - Dark mode support
 *
 * **Keyboard Interactions:**
 * - `Escape`: Closes the modal
 *
 * **Accessibility:**
 * - Uses `role="dialog"` and `aria-modal="true"`
 * - Title linked via `aria-labelledby`
 * - Close button has `aria-label`
 *
 * @component
 * @example
 * // Basic modal
 * <Modal
 *   open={isOpen}
 *   title="Confirm Delete"
 *   onClose={() => setIsOpen(false)}
 * >
 *   <p>Are you sure you want to delete this item?</p>
 * </Modal>
 *
 * @example
 * // Modal with footer actions
 * <Modal
 *   open={showModal}
 *   title="Edit Profile"
 *   size="lg"
 *   footer={
 *     <>
 *       <Button variant="outline" onClick={onCancel}>
 *         Cancel
 *       </Button>
 *       <Button variant="primary" onClick={onSave}>
 *         Save Changes
 *       </Button>
 *     </>
 *   }
 *   onClose={onCancel}
 * >
 *   <ProfileForm data={profile} onChange={setProfile} />
 * </Modal>
 *
 * @example
 * // Small confirmation modal
 * <Modal
 *   open={confirmDelete}
 *   title="Delete Item?"
 *   size="sm"
 *   footer={
 *     <>
 *       <Button variant="outline" onClick={() => setConfirmDelete(false)}>
 *         Cancel
 *       </Button>
 *       <Button variant="danger" onClick={handleDelete}>
 *         Delete
 *       </Button>
 *     </>
 *   }
 *   onClose={() => setConfirmDelete(false)}
 * >
 *   <p className="text-gray-600 dark:text-gray-300">
 *     This action cannot be undone.
 *   </p>
 * </Modal>
 */

/**
 * Props for the Modal component.
 *
 * @interface ModalProps
 * @property {boolean} open - Whether the modal is visible
 * @property {string} [title] - Optional title displayed in the header
 * @property {ReactNode} children - Modal content body
 * @property {ReactNode} [footer] - Optional footer content (typically buttons)
 * @property {() => void} onClose - Callback when modal should close
 * @property {'sm' | 'md' | 'lg' | 'xl'} [size='md'] - Modal width size variant
 */
interface ModalProps {
  open: boolean;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeClass: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
};

export const Modal: FC<ModalProps> = ({ open, title, children, footer, onClose, size = 'md' }) => {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 sm:px-6">
      <div className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className={clsx(
          'relative z-10 w-full rounded-2xl bg-white shadow-xl transition-all dark:bg-gray-900',
          sizeClass[size]
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
      >
        <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          {title ? (
            <h2 id="modal-title" className="text-lg font-semibold text-gray-900 dark:text-white">
              {title}
            </h2>
          ) : (
            <span className="sr-only">Modal</span>
          )}
          <button
            type="button"
            className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:text-gray-300 dark:hover:bg-gray-800"
            aria-label="Close modal"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex flex-col-reverse gap-3 border-t border-gray-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-end dark:border-gray-800">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default Modal;
