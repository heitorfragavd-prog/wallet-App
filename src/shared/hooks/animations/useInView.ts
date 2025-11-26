import { useState, useEffect, useRef, RefObject } from 'react';

interface UseInViewOptions {
  threshold?: number | number[];
  rootMargin?: string;
  triggerOnce?: boolean;
  root?: Element | null;
}

interface UseInViewReturn<T extends Element> {
  ref: RefObject<T>;
  inView: boolean;
  entry: IntersectionObserverEntry | null;
}

/**
 * Hook that tracks when an element enters the viewport using Intersection Observer.
 * Used for triggering animations when elements scroll into view.
 * 
 * @param options - Configuration options for the Intersection Observer
 * @returns Object containing ref to attach to element, inView state, and observer entry
 */
export function useInView<T extends Element = HTMLDivElement>(
  options: UseInViewOptions = {}
): UseInViewReturn<T> {
  const {
    threshold = 0,
    rootMargin = '0px',
    triggerOnce = false,
    root = null,
  } = options;

  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);
  const hasTriggered = useRef(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // If triggerOnce is true and already triggered, don't observe
    if (triggerOnce && hasTriggered.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [observerEntry] = entries;
        setEntry(observerEntry);

        const isIntersecting = observerEntry.isIntersecting;
        
        if (triggerOnce) {
          if (isIntersecting && !hasTriggered.current) {
            hasTriggered.current = true;
            setInView(true);
            observer.unobserve(element);
          }
        } else {
          setInView(isIntersecting);
        }
      },
      {
        threshold,
        rootMargin,
        root,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [threshold, rootMargin, triggerOnce, root]);

  return { ref, inView, entry };
}

export default useInView;
