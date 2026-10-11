import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../ui/Modal';
import { Button } from './Button';
import { useConfirmStore } from '../../lib/confirm';

/** Renders the question asked with `confirmDialog()`. Mount once, in the app shell. */
export function ConfirmHost() {
  const { t } = useTranslation('common');
  const request = useConfirmStore((state) => state.request);
  const open = useConfirmStore((state) => state.open);
  const settle = useConfirmStore((state) => state.settle);

  const danger = request?.tone === 'danger';
  const confirmLabel = request?.confirmLabel ?? (danger ? t('buttons.delete') : t('buttons.confirm'));

  return (
    <Modal
      open={open}
      onClose={() => settle(false)}
      size="sm"
      showCloseButton={false}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={() => settle(false)}>
            {request?.cancelLabel ?? t('buttons.cancel')}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} type="button" onClick={() => settle(true)} data-autofocus>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-4">
        {danger && (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 pt-0.5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{request?.title}</h2>
          {request?.message && (
            <div className="mt-1.5 text-sm text-gray-600 dark:text-gray-300">{request.message}</div>
          )}
        </div>
      </div>
    </Modal>
  );
}
