import { FC, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy } from 'lucide-react';
import { Button } from './Button';
import type { ButtonSize, ButtonVariant } from './buttonStyles';
import { toast } from '../../lib/toast';
import { copyToClipboard } from '../../lib/clipboard';

interface CopyButtonProps {
  value: string;
  /** Defaults to "Copy" */
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

/**
 * Copies `value` and confirms it in place for two seconds — visibly (icon and
 * label) and to screen readers (polite live region).
 */
export const CopyButton: FC<CopyButtonProps> = ({ value, label, variant = 'secondary', size = 'sm', className }) => {
  const { t } = useTranslation('common');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    try {
      await copyToClipboard(value);
      setCopied(true);
    } catch {
      toast.error(t('messages.copyFailed'));
    }
  };

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={handleCopy}
        leftIcon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      >
        {copied ? t('buttons.copied') : label ?? t('buttons.copy')}
      </Button>
      <span className="sr-only" aria-live="polite">
        {copied ? t('buttons.copied') : ''}
      </span>
    </>
  );
};
