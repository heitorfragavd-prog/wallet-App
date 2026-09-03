import '@testing-library/jest-dom';
import { configure } from '@testing-library/dom';

// Increase default async timeout for waitFor to 3000ms under heavy v8 coverage runs
configure({ asyncUtilTimeout: 3000 });

// Mock IntersectionObserver
class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];

  constructor(
    private callback: IntersectionObserverCallback,
    _options?: IntersectionObserverInit
  ) {}

  observe(_target: Element): void {}
  unobserve(_target: Element): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

global.IntersectionObserver = MockIntersectionObserver;

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mock ResizeObserver
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

global.ResizeObserver = MockResizeObserver;

// Default environment variables for test runners
process.env.VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key';
process.env.VITE_APP_NAME = process.env.VITE_APP_NAME || 'Wallet';
process.env.VITE_APP_URL = process.env.VITE_APP_URL || 'http://localhost:8080';
process.env.VITE_APP_ENVIRONMENT = process.env.VITE_APP_ENVIRONMENT || 'development';

// Polyfill Promise.withResolvers for Node.js < 22 and PDF.js
interface PromiseWithResolvers<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

if (typeof (Promise as unknown as { withResolvers?: unknown }).withResolvers === 'undefined') {
  (Promise as unknown as { withResolvers: <T>() => PromiseWithResolvers<T> }).withResolvers = function <T>(): PromiseWithResolvers<T> {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

