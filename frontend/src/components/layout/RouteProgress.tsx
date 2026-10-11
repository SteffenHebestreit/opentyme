import { useEffect, useState } from 'react';
import { useNavigation } from 'react-router-dom';
import { cn } from '../../lib/cn';

/**
 * Thin bar at the top of the viewport while a page (its code chunk or loader)
 * is loading. Waits a moment before showing, so instant navigations stay quiet.
 */
export function RouteProgress() {
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!busy) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), 120);
    return () => clearTimeout(timer);
  }, [busy]);

  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-x-0 top-0 z-[70] h-0.5 overflow-hidden transition-opacity duration-300',
        visible ? 'opacity-100' : 'opacity-0'
      )}
      aria-hidden="true"
    >
      <div className="h-full w-full origin-left animate-progress-indeterminate bg-gradient-to-r from-purple-500 via-purple-400 to-pink-500" />
    </div>
  );
}
