import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query'
import App from './App.tsx'
import './index.css'
import { ThemeProvider } from './shared/components/ThemeProvider'
import { errorService } from '@/core/errors/ErrorService'

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      // Global asynchronous query failure logging without disrupting UI handling
      const queryKeyStr = Array.isArray(query.queryKey)
        ? query.queryKey.map((k) => (typeof k === 'object' ? JSON.stringify(k) : String(k))).join('/')
        : String(query.queryKey);

      errorService.handle(error, {
        source: 'react-query',
        operation: `query:${queryKeyStr}`,
      });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      // Global asynchronous mutation failure logging
      const mutationKeyStr = mutation.options.mutationKey
        ? Array.isArray(mutation.options.mutationKey)
          ? mutation.options.mutationKey.map((k) => (typeof k === 'object' ? JSON.stringify(k) : String(k))).join('/')
          : String(mutation.options.mutationKey)
        : 'anonymous_mutation';

      errorService.handle(error, {
        source: 'react-query',
        operation: `mutation:${mutationKeyStr}`,
      });
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="system">
      <App />
    </ThemeProvider>
  </QueryClientProvider>
);
