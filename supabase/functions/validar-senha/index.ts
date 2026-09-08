import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function derivePbkdf2Hash(password: string, salt: string): Promise<string> {
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

async function verifyPassword(password: string, salt: string, storedHash: string): Promise<boolean> {
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

async function createInvestmentToken(userId: string, secretKey: string): Promise<string> {
  const expiresAt = Date.now() + 30 * 60 * 1000;
  const payload = `${userId}:${expiresAt}`;
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Token de autenticação ausente" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Usuário não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Proteção estrita contra IDOR: a identidade é SEMPRE obtida do token verificado
    const authenticatedUserId = user.id;

    const { mode, senha } = await req.json().catch(() => ({}));

    if (!senha || typeof senha !== "string" || senha.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Senha inválida ou vazia" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Salting por usuário + PBKDF2 com 100.000 iterações
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

      const sessionToken = await createInvestmentToken(authenticatedUserId, supabaseServiceKey);
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

      // Verificar bloqueio temporal
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
        // Se a senha estava em formato legado, atualiza atomicamente para PBKDF2
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

        const sessionToken = await createInvestmentToken(authenticatedUserId, supabaseServiceKey);
        return new Response(JSON.stringify({ valido: true, token: sessionToken }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } else {
        // Falha: incrementar tentativas com bloqueio progressivo
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
          tentativasRestantes: Math.max(0, 3 - novasTentativas),
          bloqueado,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    return new Response(JSON.stringify({ error: "Modo inválido" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return new Response(JSON.stringify({ error: message, success: false }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
