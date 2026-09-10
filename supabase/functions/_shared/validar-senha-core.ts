/**
 * validar-senha-core.ts
 *
 * Módulo central de criptografia e gerenciamento de sessões de investimento.
 * Compartilhado entre o runtime Deno (Edge Functions) e a suíte de testes (Vitest/Node).
 *
 * REGRAS DE SEGURANÇA:
 * 1. Primeiro Cadastro (mode: "cadastrar"):
 *    - Rejeita se já existir senha cadastrada (409 Conflict).
 *    - Usa INSERT exclusivo (não upsert), protegido pela constraint UNIQUE(user_id).
 * 2. Alteração de Senha (mode: "alterar_senha"):
 *    - Exige comprovação da senha atual (senha_atual) e da nova senha (nova_senha).
 *    - Invalida todas as sessões ativas do usuário em caso de alteração bem-sucedida.
 * 3. Coerência de Sessão em verify_token:
 *    - Valida HMAC + expiração + correspondência com o banco (investimentos_sessions).
 *    - Garante que token emitido para uma sessão NÃO valida em outra sessão do mesmo usuário.
 * 4. Incremento Atômico de Falhas:
 *    - Invoca RPC registrar_falha_senha_investimentos para prevenir race conditions.
 */

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  const enc = new TextEncoder();
  const data = enc.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const legacyHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return legacyHash === storedHash;
}

export async function createInvestmentToken(
  userId: string,
  secretKey: string,
  sessionId?: string
): Promise<string> {
  const expiresAt = Date.now() + 30 * 60 * 1000;
  const nonce = crypto.randomUUID();
  const purpose = "investimentos_auth";
  const sid = sessionId || "no_sid";
  const payload = `${userId}:${expiresAt}:${purpose}:${nonce}:${sid}`;
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

export async function verifyInvestmentToken(
  token: string,
  expectedUserId: string,
  secretKey: string,
  expectedSessionId?: string
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
  const tokenSessionId = payloadParts[4];

  if (!userId || isNaN(expiresAt)) {
    return { valid: false, reason: "Campos obrigatórios ausentes no payload" };
  }

  if (purpose && purpose !== "investimentos_auth") {
    return { valid: false, reason: "Finalidade do token inválida" };
  }

  if (userId !== expectedUserId) {
    return { valid: false, reason: "Token pertence a outro usuário (violação IDOR)" };
  }

  if (expectedSessionId && tokenSessionId && tokenSessionId !== "no_sid" && tokenSessionId !== expectedSessionId) {
    return { valid: false, reason: "Token não pertence à sessão autenticada atual" };
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

    // Rejeição fail-closed imediata se session_id ou jti estiverem ausentes do token JWT
    if (!authenticatedSessionId || typeof authenticatedSessionId !== "string" || authenticatedSessionId.trim().length === 0) {
      return new Response(JSON.stringify({
        error: "Sessão inválida ou não identificada: session_id ou jti ausente no token",
        valid: false
      }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const body = await req.json().catch(() => ({}));
    const { mode, senha, senha_atual, nova_senha, token: invToken } = body;

    // -----------------------------------------------------------------------
    // 1. verify_token (Coerência de sessão + validação DB ativa)
    // -----------------------------------------------------------------------
    if (mode === "verify_token") {
      if (!invToken || typeof invToken !== "string") {
        return new Response(JSON.stringify({ valid: false, error: "Token de investimento não informado" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Validação criptográfica HMAC vinculada obrigatoriamente à sessão autenticada atual
      const verification = await verifyInvestmentToken(
        invToken,
        authenticatedUserId,
        serviceKey,
        authenticatedSessionId
      );

      if (!verification.valid) {
        return new Response(JSON.stringify(verification), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Validação da sessão ativa no banco de dados (obrigatória — sem bypass)
      const { data: activeSession, error: sessionErr } = await supabaseAdmin
        .from("investimentos_sessions")
        .select("expires_at")
        .eq("session_id", authenticatedSessionId)
        .eq("user_id", authenticatedUserId)
        .maybeSingle();

      if (sessionErr) {
        console.error("[validar-senha] Erro ao consultar sessão no DB:", sessionErr);
        return new Response(JSON.stringify({ valid: false, error: "Erro de validação no banco de dados" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (!activeSession || new Date(activeSession.expires_at) <= new Date()) {
        return new Response(JSON.stringify({ valid: false, error: "Sessão de investimentos expirada ou revogada" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({ valid: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // -----------------------------------------------------------------------
    // 2. invalidar_sessao
    // -----------------------------------------------------------------------
    if (mode === "invalidar_sessao") {
      const { error: delErr } = await supabaseAdmin
        .from("investimentos_sessions")
        .delete()
        .eq("session_id", authenticatedSessionId)
        .eq("user_id", authenticatedUserId);

      if (delErr) {
        console.error("[validar-senha] Erro ao excluir sessão do banco:", delErr);
        return new Response(JSON.stringify({ success: false, error: "Erro ao encerrar sessão no banco" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ success: true, message: "Sessão de investimentos encerrada" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const userSalt = `wallet_inv_${authenticatedUserId}`;

    // -----------------------------------------------------------------------
    // 3. cadastrar (Primeiro cadastro protegido contra sobrescrita indevida)
    // -----------------------------------------------------------------------
    if (mode === "cadastrar") {
      if (!senha || typeof senha !== "string" || senha.trim().length === 0) {
        return new Response(JSON.stringify({ error: "Senha inválida ou vazia" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Impede substituição: verifica se já existe senha cadastrada
      const { data: existing, error: checkErr } = await supabaseAdmin
        .from("senha_investimentos")
        .select("id")
        .eq("user_id", authenticatedUserId)
        .maybeSingle();

      if (checkErr) throw checkErr;

      if (existing) {
        return new Response(JSON.stringify({
          error: "Senha de investimentos já cadastrada. Utilize o modo alterar_senha com comprovação da senha atual."
        }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const hash = await derivePbkdf2Hash(senha, userSalt);

      // INSERT exclusivo (não upsert) com proteção UNIQUE(user_id)
      const { error: insertErr } = await supabaseAdmin
        .from("senha_investimentos")
        .insert({
          user_id: authenticatedUserId,
          senha_hash: hash,
          tentativas_falhas: 0,
          bloqueado_ate: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (insertErr) {
        // Conflito concorrente de chave única
        if (insertErr.code === "23505" || insertErr.message?.includes("duplicate key")) {
          return new Response(JSON.stringify({
            error: "Senha de investimentos já cadastrada concorrentemente."
          }), {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        throw insertErr;
      }

      // Registra a sessão atual desbloqueada (obrigatório e fail-closed)
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const { error: sessErr } = await supabaseAdmin
        .from("investimentos_sessions")
        .insert({
          session_id: authenticatedSessionId,
          user_id: authenticatedUserId,
          expires_at: expiresAt,
        });

      if (sessErr) {
        console.error("[validar-senha] Falha ao registrar sessão desbloqueada no cadastro:", sessErr);
        return new Response(JSON.stringify({ error: "Falha ao registrar sessão desbloqueada no banco" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const sessionToken = await createInvestmentToken(authenticatedUserId, serviceKey, authenticatedSessionId);
      return new Response(JSON.stringify({ success: true, token: sessionToken }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // -----------------------------------------------------------------------
    // 4. alterar_senha (Exige comprovação da senha atual)
    // -----------------------------------------------------------------------
    if (mode === "alterar_senha") {
      if (!senha_atual || !nova_senha || typeof senha_atual !== "string" || typeof nova_senha !== "string") {
        return new Response(JSON.stringify({ error: "senha_atual e nova_senha são obrigatórias" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const { data: record, error: fetchErr } = await supabaseAdmin
        .from("senha_investimentos")
        .select("*")
        .eq("user_id", authenticatedUserId)
        .maybeSingle();

      if (fetchErr) throw fetchErr;

      if (!record) {
        return new Response(JSON.stringify({ error: "Nenhuma senha cadastrada para alteração" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Checa bloqueio
      if (record.bloqueado_ate && new Date() < new Date(record.bloqueado_ate)) {
        return new Response(JSON.stringify({ error: "Acesso bloqueado por tentativas falhas" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const match = await verifyPassword(senha_atual, userSalt, record.senha_hash);
      if (!match) {
        // Incremento atômico de falha — Fail-closed estrito sem fallback não-atômico
        const { error: rpcErr } = await supabaseAdmin.rpc("registrar_falha_senha_investimentos", { p_user_id: authenticatedUserId });
        if (rpcErr) {
          console.error("[validar-senha] Falha crítica na RPC registrar_falha_senha_investimentos:", rpcErr);
          return new Response(JSON.stringify({ error: "Erro interno ao processar validação de segurança" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        return new Response(JSON.stringify({ error: "Senha atual incorreta" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const newHash = await derivePbkdf2Hash(nova_senha, userSalt);

      // Atualiza o hash com lock otimista garantindo que não foi modificado concorrentemente
      const { error: updateErr } = await supabaseAdmin
        .from("senha_investimentos")
        .update({
          senha_hash: newHash,
          tentativas_falhas: 0,
          bloqueado_ate: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", authenticatedUserId)
        .eq("senha_hash", record.senha_hash);

      if (updateErr) throw updateErr;

      // REVOGA TODAS as sessões anteriores de investimentos deste usuário (fail-closed)
      const { error: delAllErr } = await supabaseAdmin
        .from("investimentos_sessions")
        .delete()
        .eq("user_id", authenticatedUserId);

      if (delAllErr) {
        console.error("[validar-senha] Falha crítica ao revogar sessões anteriores:", delAllErr);
        return new Response(JSON.stringify({ error: "Falha ao revogar sessões anteriores no banco" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Desbloqueia exclusivamente a sessão atual
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const { error: insSessErr } = await supabaseAdmin
        .from("investimentos_sessions")
        .insert({
          session_id: authenticatedSessionId,
          user_id: authenticatedUserId,
          expires_at: expiresAt,
        });

      if (insSessErr) {
        console.error("[validar-senha] Falha crítica ao registrar nova sessão desbloqueada:", insSessErr);
        return new Response(JSON.stringify({ error: "Falha ao registrar nova sessão desbloqueada" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const sessionToken = await createInvestmentToken(authenticatedUserId, serviceKey, authenticatedSessionId);
      return new Response(JSON.stringify({ success: true, message: "Senha alterada com sucesso", token: sessionToken }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // -----------------------------------------------------------------------
    // 5. validar (Autenticação comum com senha de investimentos)
    // -----------------------------------------------------------------------
    if (mode === "validar") {
      if (!senha || typeof senha !== "string" || senha.trim().length === 0) {
        return new Response(JSON.stringify({ error: "Senha inválida ou vazia" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

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

      if (data.bloqueado_ate && new Date() < new Date(data.bloqueado_ate)) {
        return new Response(JSON.stringify({ valido: false, bloqueado: true, error: "Acesso bloqueado por tentativas falhas." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const match = await verifyPassword(senha, userSalt, data.senha_hash);

      if (match) {
        let newHash = data.senha_hash;
        if (!data.senha_hash.startsWith("$pbkdf2$")) {
          newHash = await derivePbkdf2Hash(senha, userSalt);
        }

        const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

        // Tentativa de desbloqueio atômico via RPC desbloquear_sessao_investimentos
        // que garante que a senha não foi alterada concorrentemente enquanto PBKDF2 rodava
        const { data: unlockOk, error: unlockErr } = await supabaseAdmin.rpc("desbloquear_sessao_investimentos", {
          p_user_id: authenticatedUserId,
          p_session_id: authenticatedSessionId,
          p_expected_hash: data.senha_hash,
          p_new_hash: newHash,
          p_expires_at: expiresAt,
        });

        if (unlockErr) {
          // Fallback seguro: checagem estrita de versão do hash
          const { data: currentRecord, error: checkErr } = await supabaseAdmin
            .from("senha_investimentos")
            .select("senha_hash")
            .eq("user_id", authenticatedUserId)
            .maybeSingle();

          if (checkErr || !currentRecord || currentRecord.senha_hash !== data.senha_hash) {
            return new Response(JSON.stringify({
              valido: false,
              error: "A senha foi alterada concorrentemente. Autenticação com credencial anterior rejeitada."
            }), {
              status: 409,
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }

          // Atualiza hash garantindo correspondência
          const { error: updErr } = await supabaseAdmin
            .from("senha_investimentos")
            .update({
              senha_hash: newHash,
              tentativas_falhas: 0,
              bloqueado_ate: null,
              updated_at: new Date().toISOString()
            })
            .eq("user_id", authenticatedUserId)
            .eq("senha_hash", data.senha_hash);

          if (updErr) {
            return new Response(JSON.stringify({ valido: false, error: "Concorrência detectada na validação" }), {
              status: 409,
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }

          const { error: sessErr } = await supabaseAdmin
            .from("investimentos_sessions")
            .upsert({
              session_id: authenticatedSessionId,
              user_id: authenticatedUserId,
              expires_at: expiresAt,
            });

          if (sessErr) {
            console.error("[validar-senha] Falha ao registrar sessão no DB:", sessErr);
            return new Response(JSON.stringify({ valido: false, error: "Falha ao registrar sessão desbloqueada no banco" }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }
        } else if (!unlockOk) {
          return new Response(JSON.stringify({
            valido: false,
            error: "A senha foi alterada concorrentemente. Autenticação com credencial antiga rejeitada."
          }), {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const sessionToken = await createInvestmentToken(authenticatedUserId, serviceKey, authenticatedSessionId);
        return new Response(JSON.stringify({ valido: true, token: sessionToken }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } else {
        // Incremento ATÔMICO estrito de falha — Fail-closed sem fallback inseguro
        const { data: falhaResult, error: falhaErr } = await supabaseAdmin
          .rpc("registrar_falha_senha_investimentos", { p_user_id: authenticatedUserId });

        if (falhaErr || !falhaResult || !falhaResult[0]) {
          console.error("[validar-senha] Falha crítica na RPC registrar_falha_senha_investimentos:", falhaErr);
          return new Response(JSON.stringify({ valido: false, error: "Erro interno ao registrar falha de segurança" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const { tentativas_falhas: novasTentativas, bloqueado } = falhaResult[0];

        return new Response(JSON.stringify({
          valido: false,
          bloqueado,
          tentativas_restantes: Math.max(0, 3 - novasTentativas),
          error: bloqueado ? "Acesso bloqueado por 30 minutos após 3 tentativas inválidas." : "Senha incorreta"
        }), {
          status: 401,
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