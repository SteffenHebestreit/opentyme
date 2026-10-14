/**
 * Writes text to the clipboard. The Clipboard API only exists in secure
 * contexts (https, localhost); elsewhere fall back to a hidden textarea.
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    if (!document.execCommand('copy')) throw new Error('copy command was refused');
  } finally {
    document.body.removeChild(textarea);
  }
}
