import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Plugin de Servidor Backend Node para geração de Tokens e Busca de Contas/Transações da Pluggy
function pluggyTokenServerPlugin() {
  return {
    name: "pluggy-token-server",
    configureServer(server: any) {
      // Helper de Autenticação com a API da Pluggy (Leitura Estrita do .env)
      const getApiKey = async (env: any) => {
        const clientId = (
          env.PLUGGY_CLIENT_ID ||
          env.VITE_PLUGGY_CLIENT_ID ||
          process.env.PLUGGY_CLIENT_ID ||
          process.env.VITE_PLUGGY_CLIENT_ID ||
          ""
        ).trim();

        const clientSecret = (
          env.PLUGGY_CLIENT_SECRET ||
          env.VITE_PLUGGY_CLIENT_SECRET ||
          process.env.PLUGGY_CLIENT_SECRET ||
          process.env.VITE_PLUGGY_CLIENT_SECRET ||
          ""
        ).trim();

        if (!clientId || !clientSecret) {
          throw new Error("Chaves do .env ausentes");
        }

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
          const env = loadEnv(server.config.mode || "development", process.cwd(), "");
          const clientId = (
            env.PLUGGY_CLIENT_ID ||
            env.VITE_PLUGGY_CLIENT_ID ||
            process.env.PLUGGY_CLIENT_ID ||
            process.env.VITE_PLUGGY_CLIENT_ID ||
            ""
          ).trim();

          const clientSecret = (
            env.PLUGGY_CLIENT_SECRET ||
            env.VITE_PLUGGY_CLIENT_SECRET ||
            process.env.PLUGGY_CLIENT_SECRET ||
            process.env.VITE_PLUGGY_CLIENT_SECRET ||
            ""
          ).trim();

          if (!clientId || !clientSecret) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            return res.end(JSON.stringify({ error: "Credenciais do .env ausentes" }));
          }

          // 1. Autenticação para obter apiKey
          const authRes = await fetch("https://api.pluggy.ai/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientId, clientSecret }),
          });
          const authData = await authRes.json();

          if (!authData.apiKey) {
            res.statusCode = 401;
            res.setHeader("Content-Type", "application/json");
            return res.end(JSON.stringify({ error: "Falha na autenticação da Pluggy", details: authData }));
          }

          // 2. Geração do Connect Token de Sessão
          const tokenRes = await fetch("https://api.pluggy.ai/connect_tokens", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-API-KEY": authData.apiKey,
            },
            body: JSON.stringify({
              options: {
                clientUserId: "user-default-01",
              },
            }),
          });

          const tokenData = await tokenRes.json();

          if (tokenData.accessToken) {
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            return res.end(JSON.stringify({ accessToken: tokenData.accessToken }));
          } else {
            console.error("❌ ERRO PLUGGY CONNECT TOKENS:", tokenData);
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            return res.end(
              JSON.stringify({
                error: tokenData.message || tokenData.detail || "Erro ao gerar accessToken na Pluggy",
                details: tokenData,
              })
            );
          }
        } catch (err: any) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          return res.end(JSON.stringify({ error: err?.message || "Erro interno no servidor" }));
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

          const env = loadEnv(server.config.mode || "development", process.cwd(), "");
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
          return res.end(JSON.stringify({ error: err?.message || "Erro ao buscar contas do Pluggy Item" }));
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

          const env = loadEnv(server.config.mode || "development", process.cwd(), "");
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
          return res.end(JSON.stringify({ error: err?.message || "Erro ao buscar transações do Pluggy Item" }));
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
