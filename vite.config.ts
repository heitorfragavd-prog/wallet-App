import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Plugin de Servidor Backend Node para geração segura do Connect Token da Pluggy com logs detalhados
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

          // 1. Fallback Robusto de Variáveis de Ambiente
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

          console.log(`[Pluggy Server Auth] Iniciando POST /auth. ClientID: ${clientId ? clientId.substring(0, 12) + "..." : "NULO"}`);

          // 2. Chamada autenticada POST /auth no lado do servidor com Logs Detalhados
          const authRes = await fetch("https://api.pluggy.ai/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientId, clientSecret }),
          });

          const authStatus = authRes.status;
          const authText = await authRes.text();
          console.log(`[Pluggy Server Auth Response] Status: ${authStatus}, Body: ${authText}`);

          let authData: any = {};
          try {
            authData = JSON.parse(authText);
          } catch (e) {}

          if (!authRes.ok) {
            console.error(`[Pluggy Server Auth Error] Falha ${authStatus}: ${authText}`);
            res.statusCode = authStatus;
            res.setHeader("Content-Type", "application/json");
            return res.end(JSON.stringify({ error: authData.message || `Erro HTTP ${authStatus} na autenticação Pluggy: ${authText}` }));
          }

          const { apiKey } = authData;

          // 3. Chamada autenticada POST /connect_token
          console.log(`[Pluggy ConnectToken Request] Solicitando token com apiKey obtido.`);
          const tokenRes = await fetch("https://api.pluggy.ai/connect_token", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-API-KEY": apiKey,
            },
            body: JSON.stringify({ options: { sandbox: true } }),
          });

          const tokenStatus = tokenRes.status;
          const tokenText = await tokenRes.text();
          console.log(`[Pluggy ConnectToken Response] Status: ${tokenStatus}, Body: ${tokenText}`);

          let tokenData: any = {};
          try {
            tokenData = JSON.parse(tokenText);
          } catch (e) {}

          if (!tokenRes.ok) {
            console.error(`[Pluggy ConnectToken Error] Falha ${tokenStatus}: ${tokenText}`);
            res.statusCode = tokenStatus;
            res.setHeader("Content-Type", "application/json");
            return res.end(JSON.stringify({ error: tokenData.message || `Erro HTTP ${tokenStatus} ao gerar connectToken: ${tokenText}` }));
          }

          const { accessToken } = tokenData;

          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          return res.end(JSON.stringify({ accessToken }));
        } catch (err: any) {
          console.error("[Pluggy Server Exception]", err);
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
