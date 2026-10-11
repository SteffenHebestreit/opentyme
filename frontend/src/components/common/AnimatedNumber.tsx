import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../../hooks/ui/useReducedMotion';
import { cn } from '../../lib/cn';

interface AnimatedNumberProps {
  /** Target value. */
  value: number;
  /** Formats the (intermediate) value for display, e.g. currency or hours. */
  format?: (value: number) => string;
  /** Count duration in ms. */
  duration?: number;
  /** Count up from 0 when first shown (default true). */
  animateOnMount?: boolean;
  className?: string;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const defaultFormat = (value: number) => value.toLocaleString();

/**
 * A number that counts smoothly to its new value and briefly highlights when it
 * changes — so a total that updates after a save is noticed without being loud.
 *
 * @example
 * <AnimatedNumber value={metrics.hoursThisWeek} format={(h) => `${h.toFixed(1)} h`} />
 */
export function AnimatedNumber({
  value,
  format = defaultFormat,
  duration = 650,
  animateOnMount = true,
  className,
}: AnimatedNumberProps) {
  const reduced = prefersReducedMotion();
  const [display, setDisplay] = useState(() => (animateOnMount && !reduced ? 0 : value));
  const [changes, setChanges] = useState(0);
  const fromRef = useRef(display);
  const lastTargetRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    if (lastTargetRef.current !== value) {
      lastTargetRef.current = value;
      setChanges((count) => count + 1);
    }

    if (reduced || from === value || !Number.isFinite(value)) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }

    const wholeNumbers = Number.isInteger(value) && Number.isInteger(from);
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const next = from + (value - from) * easeOutCubic(progress);
      fromRef.current = next;
      setDisplay(wholeNumbers ? Math.round(next) : next);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, reduced]);

  return (
    <span
      key={changes}
      className={cn('tabular-nums', changes > 0 && '-mx-1 rounded px-1 animate-highlight', className)}
    >
      {format(display)}
    </span>
  );
}
