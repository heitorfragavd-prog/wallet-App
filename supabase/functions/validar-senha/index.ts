import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { processValidarSenha, corsHeaders } from "../_shared/validar-senha-core.ts";

serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // Validação estrita de autorização e proteção IDOR em validar-senha-core:
  // - Extrai e valida Authorization via auth.getUser(token) (retorna 401 se ausente)
  // - Rejeita tentativas onde authUser.id !== user_id com código 403
  // - Gerencia operações de mode === "cadastrar" e mode === "validar" em senha_investimentos
  return processValidarSenha(req, supabaseAdmin, supabaseServiceKey);
});
