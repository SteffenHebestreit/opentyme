/**
 * @fileoverview A file picker that also accepts drag & drop.
 *
 * Shows a large target until a file is chosen, then the chosen file with its
 * size and a way to pick another — instead of the browser's bare
 * "Choose File / No file chosen" control.
 *
 * @module components/forms/FileDropZone
 */

import { FC, useId, useRef, useState } from 'react';
import clsx from 'clsx';
import { FileText, UploadCloud, X } from 'lucide-react';
import { formatFileSize } from '../../utils/fileSize';

interface FileDropZoneProps {
  file: File | null;
  onFile: (file: File | null) => void;
  accept?: string;
  /** Main prompt, e.g. "Datei hierher ziehen oder auswählen". */
  prompt: string;
  /** Allowed types and size, shown under the prompt. */
  hint?: string;
  /** Label for the "pick another file" action. */
  changeLabel: string;
  /** Accessible label for removing the chosen file. */
  removeLabel: string;
  error?: string;
  locale?: string;
}

export const FileDropZone: FC<FileDropZoneProps> = ({
  file,
  onFile,
  accept,
  prompt,
  hint,
  changeLabel,
  removeLabel,
  error,
  locale,
}) => {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const pick = (list: FileList | null) => {
    const picked = list?.[0] ?? null;
    if (picked) onFile(picked);
  };

  return (
    <div>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(event) => {
          pick(event.target.files);
          // Allow picking the same file again after removing it.
          event.target.value = '';
        }}
      />

      {file ? (
        <div
          className={clsx(
            'flex items-center gap-3 rounded-xl border px-4 py-3',
            error
              ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30'
              : 'border-purple-200 bg-purple-50 dark:border-purple-800/60 dark:bg-purple-900/20'
          )}
        >
          <FileText className="h-6 w-6 shrink-0 text-purple-600 dark:text-purple-400" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{file.name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{formatFileSize(file.size, locale)}</p>
          </div>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-xs font-medium text-purple-700 hover:bg-purple-100 dark:text-purple-300 dark:hover:bg-purple-900/40"
            onClick={() => inputRef.current?.click()}
          >
            {changeLabel}
          </button>
          <button
            type="button"
            className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            onClick={() => onFile(null)}
            aria-label={removeLabel}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            pick(event.dataTransfer.files);
          }}
          className={clsx(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors',
            isDragging
              ? 'border-purple-500 bg-purple-50 dark:border-purple-400 dark:bg-purple-900/30'
              : error
                ? 'border-red-300 hover:border-red-400 dark:border-red-800'
                : 'border-gray-300 hover:border-purple-400 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-purple-500 dark:hover:bg-gray-800/50'
          )}
        >
          <UploadCloud className="h-8 w-8 text-purple-500 dark:text-purple-400" aria-hidden="true" />
          <span className="text-sm font-medium text-gray-900 dark:text-white">{prompt}</span>
          {hint ? <span className="text-xs text-gray-500 dark:text-gray-400">{hint}</span> : null}
        </label>
      )}

      {error ? <p className="mt-1 text-xs text-red-500">{error}</p> : null}
    </div>
  );
};
