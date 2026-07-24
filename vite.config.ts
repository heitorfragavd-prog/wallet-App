import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Plugin de Servidor Backend Node para geração de Tokens e Busca de Contas/Transações da Pluggy
function pluggyTokenServerPlugin() {
  return {
    name: "pluggy-token-server",
    configureServer(server: any) {
      // Helper de Autenticação com a API da Pluggy no lado do Servidor Node
      const getApiKey = async (env: any) => {
        const clientId =
          process.env.PLUGGY_CLIENT_ID ||
          process.env.VITE_PLUGGY_CLIENT_ID ||
          env.PLUGGY_CLIENT_ID ||
          env.VITE_PLUGGY_CLIENT_ID ||
          "486da007-85b3-4e9e-9260-bea8e2d94c55";

        const clientSecret =
          process.env.PLUGGY_CLIENT_SECRET ||
          process.env.VITE_PLUGGY_CLIENT_SECRET ||
          env.PLUGGY_CLIENT_SECRET ||
          env.VITE_PLUGGY_CLIENT_SECRET ||
          "dWHWyvAgSTjYJC5XHBcC0uMk0gO2iFILdyi0IRVkAns";

        const authRes = await fetch("https://api.pluggy.ai/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, clientSecret }),
        });

        if (!authRes.ok) {
          const errText = await authRes.text();
          throw new Error(`Erro Auth Pluggy (${authRes.status}): ${errText}`);
        }

        const data = await authRes.json();
        return data.apiKey;
      };

      // Rota 1: /api/pluggy/connect-token
      server.middlewares.use("/api/pluggy/connect-token", async (req: any, res: any, next: any) => {
        if (req.method !== "POST" && req.method !== "GET") return next();

        try {
          const env = loadEnv("development", process.cwd(), "");
          const apiKey = await getApiKey(env);

          const tokenRes = await fetch("https://api.pluggy.ai/connect_token", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-API-KEY": apiKey,
            },
            body: JSON.stringify({ options: { sandbox: true } }),
          });

          if (!tokenRes.ok) {
            const errText = await tokenRes.text();
            res.statusCode = tokenRes.status;
            res.setHeader("Content-Type", "application/json");
            return res.end(JSON.stringify({ error: `Erro connectToken: ${errText}` }));
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

      // Rota 2: /api/pluggy/accounts (Busca contas do item conectado)
      server.middlewares.use("/api/pluggy/accounts", async (req: any, res: any, next: any) => {
        if (req.method !== "GET") return next();

        try {
          const urlObj = new URL(req.url, `http://${req.headers.host}`);
          const itemId = urlObj.searchParams.get("itemId");

          if (!itemId) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            return res.end(JSON.stringify({ error: "Parâmetro itemId é obrigatório." }));
          }

          const env = loadEnv("development", process.cwd(), "");
          const apiKey = await getApiKey(env);

          const accRes = await fetch(`https://api.pluggy.ai/accounts?itemId=${encodeURIComponent(itemId)}`, {
            headers: { "X-API-KEY": apiKey },
          });

          if (!accRes.ok) {
            const errText = await accRes.text();
            res.statusCode = accRes.status;
            res.setHeader("Content-Type", "application/json");
            return res.end(JSON.stringify({ error: `Erro ao buscar contas: ${errText}` }));
          }

          const data = await accRes.json();
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          return res.end(JSON.stringify(data));
        } catch (err: any) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          return res.end(JSON.stringify({ error: err.message || "Erro ao buscar contas do Pluggy Item" }));
        }
      });

      // Rota 3: /api/pluggy/transactions (Busca transações do item conectado)
      server.middlewares.use("/api/pluggy/transactions", async (req: any, res: any, next: any) => {
        if (req.method !== "GET") return next();

        try {
          const urlObj = new URL(req.url, `http://${req.headers.host}`);
          const itemId = urlObj.searchParams.get("itemId");

          if (!itemId) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            return res.end(JSON.stringify({ error: "Parâmetro itemId é obrigatório." }));
          }

          const env = loadEnv("development", process.cwd(), "");
          const apiKey = await getApiKey(env);

          const txRes = await fetch(`https://api.pluggy.ai/transactions?itemId=${encodeURIComponent(itemId)}`, {
            headers: { "X-API-KEY": apiKey },
          });

          if (!txRes.ok) {
            const errText = await txRes.text();
            res.statusCode = txRes.status;
            res.setHeader("Content-Type", "application/json");
            return res.end(JSON.stringify({ error: `Erro ao buscar transações: ${errText}` }));
          }

          const data = await txRes.json();
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          return res.end(JSON.stringify(data));
        } catch (err: any) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          return res.end(JSON.stringify({ error: err.message || "Erro ao buscar transações do Pluggy Item" }));
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
