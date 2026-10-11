import { cn } from '../../lib/cn';

/*
 * The OpenTYME mark: a ring of four quarter hours, three of them tracked, around a T.
 * Drawn on a 32-unit grid in currentColor. The same geometry lives in
 * public/favicon.svg and the README logos — keep them in sync.
 */
function BrandGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g stroke="currentColor" strokeWidth={4}>
        <path d="M17.46 5.6A10.5 10.5 0 0 1 26.4 14.54M26.4 17.46A10.5 10.5 0 0 1 17.46 26.4M14.54 26.4A10.5 10.5 0 0 1 5.6 17.46" />
        <path d="M5.6 14.54A10.5 10.5 0 0 1 14.54 5.6" opacity={0.28} />
      </g>
      <g fill="currentColor">
        <rect x="11.25" y="11.5" width="9.5" height="3.25" rx="1.625" />
        <rect x="14.375" y="11.5" width="3.25" height="9" rx="1.625" />
      </g>
    </svg>
  );
}

/** The OpenTYME mark on its brand tile. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-[25%] bg-gradient-to-br from-purple-500 via-purple-600 to-purple-700 text-white shadow-sm shadow-purple-900/20',
        className ?? 'h-8 w-8'
      )}
      aria-hidden="true"
    >
      <BrandGlyph className="h-full w-full" />
    </span>
  );
}

/** Mark + wordmark. */
export function BrandLogo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <BrandMark />
      {!compact && (
        <span className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-white">
          Open<span className="text-purple-600 dark:text-purple-400">TYME</span>
        </span>
      )}
    </span>
  );
}
