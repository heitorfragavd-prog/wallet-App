import { useEffect, useState, useRef, memo } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';
import { useInView, useReducedMotion } from '@/shared/hooks/animations';
import { cn } from '@/lib/utils';

export interface AnimatedCounterProps {
  /** Final value to count to */
  end: number;
  /** Animation duration in milliseconds */
  duration?: number;
  /** Prefix string (e.g., "R$") */
  prefix?: string;
  /** Suffix string (e.g., "+", "%") */
  suffix?: string;
  /** Number of decimal places */
  decimals?: number;
  /** Callback when animation completes */
  onComplete?: () => void;
  /** Additional CSS classes */
  className?: string;
  /** Start value (default: 0) */
  start?: number;
}

/**
 * Animated number counter with easing.
 * Triggers when element enters viewport via Intersection Observer.
 * Supports prefixes, suffixes, and decimal formatting.
 */
export const AnimatedCounter = memo(function AnimatedCounter({
  end,
  duration = 2000,
  prefix = '',
  suffix = '',
  decimals = 0,
  onComplete,
  className = '',
  start = 0,
}: AnimatedCounterProps) {
  const { ref, inView } = useInView<HTMLSpanElement>({ triggerOnce: true, threshold: 0.3 });
  const prefersReducedMotion = useReducedMotion();
  const [hasCompleted, setHasCompleted] = useState(false);
  const onCompleteRef = useRef(onComplete);

  // Keep onComplete ref updated
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Spring animation for smooth counting
  const springValue = useSpring(start, {
    duration: prefersReducedMotion ? 0 : duration,
    bounce: 0,
  });


  // Transform spring value to formatted string
  const displayValue = useTransform(springValue, (value) => {
    const formatted = value.toFixed(decimals);
    // Add thousand separators for Brazilian format
    const parts = formatted.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    if (parts[1]) {
      return parts.join(',');
    }
    return parts[0];
  });

  // Track animation completion
  useEffect(() => {
    if (!inView || hasCompleted) return;

    // Start animation when in view
    springValue.set(end);

    // Set up completion callback
    const unsubscribe = springValue.on('change', (value) => {
      // Check if we've reached the end value (with small tolerance for floating point)
      if (Math.abs(value - end) < 0.01 && !hasCompleted) {
        setHasCompleted(true);
        onCompleteRef.current?.();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [inView, end, springValue, hasCompleted]);

  // If reduced motion, show final value immediately
  if (prefersReducedMotion) {
    const formatted = end.toFixed(decimals);
    const parts = formatted.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const displayText = parts[1] ? parts.join(',') : parts[0];

    return (
      <span ref={ref} className={cn('tabular-nums', className)}>
        {prefix}
        {displayText}
        {suffix}
      </span>
    );
  }

  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {prefix}
      <motion.span>{displayValue}</motion.span>
      {suffix}
    </span>
  );
});

export default AnimatedCounter;
