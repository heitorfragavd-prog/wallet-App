import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Plugin de Servidor Backend Node para geração segura do Connect Token da Pluggy
function pluggyTokenServerPlugin() {
  return {
    name: "pluggy-token-server",
    configureServer(server: any) {
      server.middlewares.use("/api/pluggy/connect-token", async (req: any, res: any, next: any) => {
        if (req.method !== "POST" && req.method !== "GET") {
          return next();
        }

        try {
          const env = loadEnv("development", process.cwd(), "");
          const clientId = env.VITE_PLUGGY_CLIENT_ID || env.PLUGGY_CLIENT_ID || "486da007-85b3-4e9e-9260-bea8e2d94c55";
          const clientSecret = env.VITE_PLUGGY_CLIENT_SECRET || env.PLUGGY_CLIENT_SECRET || "dWHWyvAgSTjYJC5XHBcC0uMk0gO2iFILdyi0IRVkAns";

          // 1. Chamada autenticada POST /auth no lado do servidor
          const authRes = await fetch("https://api.pluggy.ai/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientId, clientSecret }),
          });

          if (!authRes.ok) {
            const errBody: any = await authRes.json().catch(() => ({}));
            res.statusCode = authRes.status;
            res.setHeader("Content-Type", "application/json");
            return res.end(JSON.stringify({ error: errBody.message || "Erro na autenticação Pluggy" }));
          }

          const { apiKey } = await authRes.json();

          // 2. Chamada autenticada POST /connect_token no lado do servidor
          const tokenRes = await fetch("https://api.pluggy.ai/connect_token", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-API-KEY": apiKey,
            },
            body: JSON.stringify({ options: { sandbox: true } }),
          });

          if (!tokenRes.ok) {
            const errBody: any = await tokenRes.json().catch(() => ({}));
            res.statusCode = tokenRes.status;
            res.setHeader("Content-Type", "application/json");
            return res.end(JSON.stringify({ error: errBody.message || "Erro ao gerar connect token" }));
          }

          const { accessToken } = await tokenRes.json();

          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          return res.end(JSON.stringify({ accessToken }));
        } catch (err: any) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          return res.end(JSON.stringify({ error: err.message || "Erro interno no servidor Pluggy" }));
        }
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    pluggyTokenServerPlugin(),
    mode === 'development' && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
