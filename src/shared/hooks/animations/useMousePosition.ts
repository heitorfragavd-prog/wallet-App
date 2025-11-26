import { useState, useEffect, useCallback, RefObject } from 'react';

interface MousePosition {
  x: number;
  y: number;
  normalizedX: number; // -1 to 1 range
  normalizedY: number; // -1 to 1 range
}

interface UseMousePositionOptions {
  /** Element to track mouse position relative to. If not provided, tracks window */
  elementRef?: RefObject<HTMLElement>;
  /** Whether to track mouse position */
  enabled?: boolean;
  /** Throttle updates in milliseconds */
  throttleMs?: number;
}

/**
 * Hook that tracks mouse position for parallax and interactive effects.
 * Returns both absolute and normalized (-1 to 1) coordinates.
 * 
 * @param options - Configuration options
 * @returns Current mouse position with normalized values
 */
export function useMousePosition(
  options: UseMousePositionOptions = {}
): MousePosition {
  const { elementRef, enabled = true, throttleMs = 16 } = options;

  const [position, setPosition] = useState<MousePosition>({
    x: 0,
    y: 0,
    normalizedX: 0,
    normalizedY: 0,
  });

  const lastUpdate = useCallback(() => {
    let lastTime = 0;
    return (callback: () => void) => {
      const now = Date.now();
      if (now - lastTime >= throttleMs) {
        lastTime = now;
        callback();
      }
    };
  }, [throttleMs])();

  useEffect(() => {
    if (!enabled) return;

    const handleMouseMove = (event: MouseEvent) => {
      lastUpdate(() => {
        const element = elementRef?.current;

        if (element) {
          const rect = element.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const y = event.clientY - rect.top;
          const normalizedX = (x / rect.width) * 2 - 1;
          const normalizedY = (y / rect.height) * 2 - 1;

          setPosition({
            x,
            y,
            normalizedX: Math.max(-1, Math.min(1, normalizedX)),
            normalizedY: Math.max(-1, Math.min(1, normalizedY)),
          });
        } else {
          const x = event.clientX;
          const y = event.clientY;
          const normalizedX = (x / window.innerWidth) * 2 - 1;
          const normalizedY = (y / window.innerHeight) * 2 - 1;

          setPosition({
            x,
            y,
            normalizedX,
            normalizedY,
          });
        }
      });
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [enabled, elementRef, lastUpdate]);

  return position;
}

export default useMousePosition;
