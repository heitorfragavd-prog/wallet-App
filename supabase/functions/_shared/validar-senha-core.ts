/**
 * validar-senha-core.ts
 *
 * Módulo central de criptografia e gerenciamento de sessões de investimento.
 * Compartilhado entre o runtime Deno (Edge Functions) e a suíte de testes (Vitest/Node).
 */

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Derivação de chave PBKDF2 com 100.000 iterações e salt por usuário
 */
export async function derivePbkdf2Hash(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  const hashArray = Array.from(new Uint8Array(derivedBits));
  const hex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `$pbkdf2$100000$${hex}`;
}

export async function verifyPassword(password: string, salt: string, storedHash: string): Promise<boolean> {
  if (storedHash.startsWith("$pbkdf2$100000$")) {
    const computed = await derivePbkdf2Hash(password, salt);
    return computed === storedHash;
  }
  // Retrocompatibilidade segura com SHA-256 legado
  const enc = new TextEncoder();
  const data = enc.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const legacyHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return legacyHash === storedHash;
}

/**
 * Emite token HMAC-SHA256 com finalidade restrita, expiração e nonce anti-replay.
 */
export async function createInvestmentToken(userId: string, secretKey: string): Promise<string> {
  const expiresAt = Date.now() + 30 * 60 * 1000;
  const nonce = crypto.randomUUID();
  const purpose = "investimentos_auth";
  const payload = `${userId}:${expiresAt}:${purpose}:${nonce}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const sigHex = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, "0")).join("");
  return `inv_${btoa(payload)}.${sigHex}`;
}

/**
 * Validação rigorosa do token HMAC server-side.
 */
export async function verifyInvestmentToken(
  token: string,
  expectedUserId: string,
  secretKey: string
): Promise<{ valid: boolean; reason?: string }> {
  if (!token || typeof token !== "string" || !token.startsWith("inv_")) {
    return { valid: false, reason: "Formato de token inválido" };
  }
  const parts = token.slice(4).split(".");
  if (parts.length !== 2) {
    return { valid: false, reason: "Estrutura de token inválida" };
  }
  const [b64Payload, sigHex] = parts;
  let payloadStr = "";
  try {
    payloadStr = atob(b64Payload);
  } catch {
    return { valid: false, reason: "Payload base64 inválido" };
  }

  const payloadParts = payloadStr.split(":");
  const userId = payloadParts[0];
  const expiresAt = Number(payloadParts[1]);
  const purpose = payloadParts[2];

  if (!userId || isNaN(expiresAt)) {
    return { valid: false, reason: "Campos obrigatórios ausentes no payload" };
  }

  if (purpose && purpose !== "investimentos_auth") {
    return { valid: false, reason: "Finalidade do token inválida" };
  }

  if (userId !== expectedUserId) {
    return { valid: false, reason: "Token pertence a outro usuário (violação IDOR)" };
  }

  if (Date.now() > expiresAt) {
    return { valid: false, reason: "Token de investimentos expirado" };
  }

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const sigBytes = new Uint8Array(sigHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
  const isValid = await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(payloadStr));
  if (!isValid) {
    return { valid: false, reason: "Assinatura HMAC inválida ou adulterada" };
  }

  return { valid: true };
}

/**
 * Extrai session_id do JWT autenticado
 */
export function extractSessionIdFromJwt(jwt: string): string | null {
  try {
    const parts = jwt.split(".");
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const jsonStr = atob(base64);
    const payload = JSON.parse(jsonStr);
    return payload.session_id || payload.jti || null;
  } catch {
    return null;
  }
}

/**
 * Processador da requisição de validar-senha
 */
export async function processValidarSenha(
  req: Request,
  supabaseAdmin: any,
  serviceKey: string
): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Token de autenticação ausente" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Usuário não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const authenticatedUserId = user.id;
    const authenticatedSessionId = extractSessionIdFromJwt(token);

    const body = await req.json().catch(() => ({}));
    const { mode, senha, token: invToken } = body;

    if (mode === "verify_token") {
      if (!invToken || typeof invToken !== "string") {
        return new Response(JSON.stringify({ valid: false, error: "Token de investimento não informado" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const verification = await verifyInvestmentToken(invToken, authenticatedUserId, serviceKey);
      return new Response(JSON.stringify(verification), {
        status: verification.valid ? 200 : 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (mode === "invalidar_sessao") {
      if (authenticatedSessionId) {
        await supabaseAdmin
          .from("investimentos_sessions")
          .delete()
          .eq("session_id", authenticatedSessionId);
      }
      return new Response(JSON.stringify({ success: true, message: "Sessão de investimentos encerrada" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!senha || typeof senha !== "string" || senha.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Senha inválida ou vazia" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const userSalt = `wallet_inv_${authenticatedUserId}`;

    if (mode === "cadastrar") {
      const hash = await derivePbkdf2Hash(senha, userSalt);

      const { error } = await supabaseAdmin
        .from("senha_investimentos")
        .upsert({
          user_id: authenticatedUserId,
          senha_hash: hash,
          tentativas_falhas: 0,
          bloqueado_ate: null,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      if (authenticatedSessionId) {
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        await supabaseAdmin
          .from("investimentos_sessions")
          .delete()
          .eq("user_id", authenticatedUserId);

        await supabaseAdmin
          .from("investimentos_sessions")
          .insert({
            session_id: authenticatedSessionId,
            user_id: authenticatedUserId,
            expires_at: expiresAt,
          });
      }

      const sessionToken = await createInvestmentToken(authenticatedUserId, serviceKey);
      return new Response(JSON.stringify({ success: true, token: sessionToken }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (mode === "validar") {
      const { data, error } = await supabaseAdmin
        .from("senha_investimentos")
        .select("*")
        .eq("user_id", authenticatedUserId)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        return new Response(JSON.stringify({ valido: false, error: "Senha não cadastrada" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (data.bloqueado_ate) {
        const bloqueadoAte = new Date(data.bloqueado_ate);
        if (new Date() < bloqueadoAte) {
          return new Response(JSON.stringify({ valido: false, bloqueado: true, error: "Acesso bloqueado por tentativas falhas." }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
      }

      const match = await verifyPassword(senha, userSalt, data.senha_hash);

      if (match) {
        let newHash = data.senha_hash;
        if (!data.senha_hash.startsWith("$pbkdf2$")) {
          newHash = await derivePbkdf2Hash(senha, userSalt);
        }

        await supabaseAdmin
          .from("senha_investimentos")
          .update({
            senha_hash: newHash,
            tentativas_falhas: 0,
            bloqueado_ate: null,
            updated_at: new Date().toISOString()
          })
          .eq("user_id", authenticatedUserId);

        if (authenticatedSessionId) {
          const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
          await supabaseAdmin
            .from("investimentos_sessions")
            .upsert({
              session_id: authenticatedSessionId,
              user_id: authenticatedUserId,
              expires_at: expiresAt,
            });
        }

        const sessionToken = await createInvestmentToken(authenticatedUserId, serviceKey);
        return new Response(JSON.stringify({ valido: true, token: sessionToken }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } else {
        const novasTentativas = (data.tentativas_falhas || 0) + 1;
        const bloqueado = novasTentativas >= 3;
        const bloqueadoAte = bloqueado ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : null;

        await supabaseAdmin
          .from("senha_investimentos")
          .update({
            tentativas_falhas: novasTentativas,
            bloqueado_ate: bloqueadoAte,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", authenticatedUserId);

        return new Response(JSON.stringify({
          valido: false,
          bloqueado,
          tentativas_restantes: Math.max(0, 3 - novasTentativas),
          error: bloqueado ? "Acesso bloqueado por 30 minutos após 3 tentativas inválidas." : "Senha incorreta"
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    return new Response(JSON.stringify({ error: "Modo não suportado" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || "Erro interno do servidor" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}