// Edge Function para testar conectividade do webhook
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { processTestWebhook, corsHeaders } from "../_shared/test-webhook-core.ts";

serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const supabaseAdmin = createClient(
    supabaseUrl,
    supabaseServiceKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  // Validação estrita de autorização e proteção administrativa em test-webhook-core:
  // - Exige cabeçalho Authorization com token JWT válido (401 se ausente ou inválido via auth.getUser)
  // - Exige privilégios de administrador em profiles.role (403 se usuário comum)
  // - Consulta system_settings para webhook_url e aplica validação SSRF estrita
  return processTestWebhook(req, supabaseAdmin);
});