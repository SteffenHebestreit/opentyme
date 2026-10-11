import { useEffect, useState } from 'react';
import { prefersReducedMotion } from './useReducedMotion';

/**
 * Keeps an element mounted for `exitMs` after `open` turns false so it can play
 * an exit animation.
 *
 * @returns `mounted` — render the element; `closing` — apply the exit animation
 *
 * @example
 * const { mounted, closing } = usePresence(open);
 * if (!mounted) return null;
 * return <div className={closing ? 'animate-scale-out' : 'animate-scale-in'} />;
 */
export function usePresence(open: boolean, exitMs = 160): { mounted: boolean; closing: boolean } {
  const [lingering, setLingering] = useState(false);

  useEffect(() => {
    if (open) {
      setLingering(true);
      return;
    }
    if (prefersReducedMotion()) {
      setLingering(false);
      return;
    }
    const timer = setTimeout(() => setLingering(false), exitMs);
    return () => clearTimeout(timer);
  }, [open, exitMs]);

  return { mounted: open || lingering, closing: !open && lingering };
}
