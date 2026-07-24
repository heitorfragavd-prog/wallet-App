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
        const clientId = (
          process.env.PLUGGY_CLIENT_ID ||
          process.env.VITE_PLUGGY_CLIENT_ID ||
          env.PLUGGY_CLIENT_ID ||
          env.VITE_PLUGGY_CLIENT_ID ||
          "486da007-85b3-4e9e-9260-bea8e2d94c55"
        ).replace(/['"]/g, "").trim();

        const clientSecret = (
          process.env.PLUGGY_CLIENT_SECRET ||
          process.env.VITE_PLUGGY_CLIENT_SECRET ||
          env.PLUGGY_CLIENT_SECRET ||
          env.VITE_PLUGGY_CLIENT_SECRET ||
          "dWHWyvAgSTjYJC5XHBcC0uMk0gO2iFILdyi0IRVkAns"
        ).replace(/['"]/g, "").trim();

        console.log(`[Node Server] Autenticando com Pluggy. ClientID: ${clientId}`);

        const authRes = await fetch("https://api.pluggy.ai/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, clientSecret }),
        });

        if (!authRes.ok) {
          const errText = await authRes.text();
          console.error(`[Node Server] Erro Auth Pluggy (${authRes.status}):`, errText);
          throw new Error(`Erro Auth Pluggy (${authRes.status}): ${errText}`);
        }

        const data = await authRes.json();
        console.log("[Node Server] Auth Pluggy Sucesso. API Key:", data.apiKey ? data.apiKey.substring(0, 10) + "..." : "nula");
        return data.apiKey;
      };

      // Rota 1: /api/pluggy/connect-token
      server.middlewares.use("/api/pluggy/connect-token", async (req: any, res: any, next: any) => {
        if (req.method !== "POST" && req.method !== "GET") return next();

        try {
          const env = loadEnv("development", process.cwd(), "");
          const apiKey = await getApiKey(env);

          console.log("[Node Server] Solicitando connect_token para Pluggy API...");
          const tokenRes = await fetch("https://api.pluggy.ai/connect_token", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-API-KEY": apiKey,
            },
            body: JSON.stringify({ options: { clientUserId: "user-default-1" } }),
          });

          const tokenText = await tokenRes.text();
          console.log(`[Node Server] Pluggy Response Status (${tokenRes.status}) Body:`, tokenText);

          if (!tokenRes.ok) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            return res.end(JSON.stringify({ error: `Pluggy API Erro (${tokenRes.status}): ${tokenText}` }));
          }

          let tokenData: any = {};
          try {
            tokenData = JSON.parse(tokenText);
          } catch (e) {}

          const accessToken = tokenData.accessToken || tokenData.connectToken || tokenData.token;

          if (!accessToken || typeof accessToken !== "string") {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            return res.end(JSON.stringify({ error: `API da Pluggy não retornou token válido. Resposta: ${tokenText}` }));
          }

          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          return res.end(JSON.stringify({ accessToken, connectToken: accessToken }));
        } catch (err: any) {
          console.error("[Node Server] Erro na rota /api/pluggy/connect-token:", err);
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          return res.end(JSON.stringify({ error: err.message || "Erro ao gerar token de acesso da Pluggy." }));
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
