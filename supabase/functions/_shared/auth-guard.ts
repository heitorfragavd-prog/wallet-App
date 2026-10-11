/**
 * Auth Guard para Edge Functions e Rotinas em Lote (pg_cron / webhooks internos)
 *
 * Garante que apenas chamadores autenticados e autorizados executem rotinas:
 * - Chamadas internas autenticadas via SUPABASE_SERVICE_ROLE_KEY
 * - Chamadas de cron autenticadas via CRON_SECRET (no header Authorization ou x-cron-secret)
 * - Chamadas de usuário autenticado garantindo que auth.uid() === target_user_id (previne IDOR)
 */

export function isAuthorizedCronCaller(req: Request): boolean {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  const cronSecret = Deno.env.get("CRON_SECRET")?.trim();

  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
  const xCronSecret = req.headers.get("x-cron-secret")?.trim();

  const token = authHeader ? authHeader.replace(/^Bearer\s+/i, "").trim() : null;

  if (serviceRoleKey && token && token === serviceRoleKey) {
    return true;
  }

  if (cronSecret && cronSecret.length > 0) {
    if (token && token === cronSecret) {
      return true;
    }
    if (xCronSecret && xCronSecret === cronSecret) {
      return true;
    }
  }

  return false;
}

export function unauthorizedResponse(
  message = "Unauthorized: Invalid or missing authorization credentials",
  corsHeaders: Record<string, string> = {}
): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: message,
    }),
    {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

export function forbiddenResponse(
  message = "Forbidden: Insufficient privileges for this resource",
  corsHeaders: Record<string, string> = {}
): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: message,
    }),
    {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

export async function authorizeUserOrService(
  req: Request,
  targetUserId: string,
  supabaseAdmin: any
): Promise<{ authorized: boolean; status: number; reason?: string }> {
  // 1. Chave de serviço ou segredo do cron têm permissão total
  if (isAuthorizedCronCaller(req)) {
    return { authorized: true, status: 200 };
  }

  // 2. Extrair token de usuário
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
  const token = authHeader ? authHeader.replace(/^Bearer\s+/i, "").trim() : null;

  if (!token) {
    return { authorized: false, status: 401, reason: "Missing Authorization header" };
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    return { authorized: false, status: 401, reason: "Invalid user token" };
  }

  if (data.user.id !== targetUserId) {
    return { authorized: false, status: 403, reason: "Forbidden: Cannot dispatch notifications for another user" };
  }

  return { authorized: true, status: 200 };
}
