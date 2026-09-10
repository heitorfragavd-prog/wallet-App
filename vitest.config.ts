import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'jsr:@supabase/supabase-js@2': '@supabase/supabase-js',
      'jsr:@supabase/functions-js/edge-runtime.d.ts': path.resolve(__dirname, './src/test/empty.ts'),
      'https://esm.sh/@supabase/supabase-js@2.38.4': '@supabase/supabase-js',
      'https://deno.land/std@0.168.0/http/server.ts': path.resolve(__dirname, './src/test/deno-server-mock.ts'),
    },
  },
});
