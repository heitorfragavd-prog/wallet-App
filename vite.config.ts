import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import https from "https";
import { componentTagger } from "lovable-tagger";

const supabaseIpv6Agent = new https.Agent({
  lookup: (hostname, options, cb) => {
    const callback = typeof options === 'function' ? options : cb;
    if (options && options.all) {
      callback(null, [{ address: '2606:4700:4405::6812:2ae6', family: 6 }]);
    } else {
      callback(null, '2606:4700:4405::6812:2ae6', 6);
    }
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    strictPort: true,
    proxy: {
      '/supabase-proxy': {
        target: 'https://hdeguzxkdvebdrrutbnx.supabase.co',
        changeOrigin: true,
        secure: true,
        agent: supabaseIpv6Agent,
        rewrite: (p) => p.replace(/^\/supabase-proxy/, ''),
      },
    },
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
  ].filter(Boolean),
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "@radix-ui/react-tabs",
      "@radix-ui/react-direction",
    ],
  },
}));
