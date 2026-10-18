/**
 * Auth Guard para Edge Functions e Rotinas em Lote (pg_cron / webhooks internos)
 *
 * Garante que apenas chamadores autenticados e autorizados executem rotinas:
 * - Chamadas internas autenticadas via SUPABASE_SERVICE_ROLE_KEY
 * - Chamadas de cron autenticadas via CRON_SECRET (no header Authorization ou x-cron-secret)
 * - Comparação de segredos em tempo constante (timingSafeEqual)
 * - Chamadas de usuário autenticado garantindo isolamento anti-IDOR e autorização de workspace
 */

/**
 * Comparação de strings sensíveis em tempo constante para mitigar ataques de temporização (timing attacks).
 * Converte ambas as entradas para sequências de bytes UTF-8 (Uint8Array) usando TextEncoder,
 * garantindo suporte nativo a Unicode, multi-byte e valores arbitrários.
 *
 * Se os tamanhos forem diferentes, executa o mesmo número de iterações comparando o buffer
 * contra si mesmo com a flag de divergência ativada, impedindo vazamento de informação sobre
 * o comprimento do segredo através do tempo de execução do loop.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  const aLen = aBytes.length;
  const bLen = bBytes.length;

  if (aLen === 0 || bLen === 0) {
    return false;
  }

  let mismatch = aLen === bLen ? 0 : 1;
  const compareBytes = aLen === bLen ? bBytes : aBytes;

  for (let i = 0; i < aLen; i++) {
    mismatch |= aBytes[i] ^ compareBytes[i];
  }

  return mismatch === 0;
}

/**
 * Comparação criptográfica em tempo constante via SHA-256 (Web Crypto API).
 * Mapeia entradas de qualquer tamanho para blocos fixos de exatamente 32 bytes (256 bits).
 */
export async function timingSafeEqualHash(a: string, b: string): Promise<boolean> {
  if (typeof a !== "string" || typeof b !== "string" || a.length === 0 || b.length === 0) {
    return false;
  }
  const encoder = new TextEncoder();
  const aBuf = await crypto.subtle.digest("SHA-256", encoder.encode(a));
  const bBuf = await crypto.subtle.digest("SHA-256", encoder.encode(b));
  const aBytes = new Uint8Array(aBuf);
  const bBytes = new Uint8Array(bBuf);

  let diff = 0;
  for (let i = 0; i < 32; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

export function isAuthorizedCronCaller(req: Request): boolean {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  const cronSecret = Deno.env.get("CRON_SECRET")?.trim();

  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
  const xCronSecret = req.headers.get("x-cron-secret")?.trim();

  const token = authHeader ? authHeader.replace(/^Bearer\s+/i, "").trim() : null;

  if (serviceRoleKey && token && timingSafeEqual(token, serviceRoleKey)) {
    return true;
  }

  if (cronSecret && cronSecret.length > 0) {
    if (token && timingSafeEqual(token, cronSecret)) {
      return true;
    }
    if (xCronSecret && timingSafeEqual(xCronSecret, cronSecret)) {
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

export interface AuthResult {
  authorized: boolean;
  status: number;
  reason?: string;
  isServiceRole?: boolean;
  userId?: string;
}

export async function authorizeUserOrService(
  req: Request,
  targetUserId: string | undefined,
  supabaseAdmin: any,
  options: { allowOwnerDispatch?: boolean } = { allowOwnerDispatch: true }
): Promise<AuthResult> {
  // 1. Chave de serviço ou segredo do cron têm permissão total (chamadores administrativos confiáveis)
  if (isAuthorizedCronCaller(req)) {
    return { authorized: true, status: 200, isServiceRole: true, userId: targetUserId };
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

  const callerUserId = data.user.id;
  const resolvedTargetId = targetUserId || callerUserId;

  // 3. Caso o alvo seja o próprio usuário autenticado: auto-notificação sempre permitida
  if (resolvedTargetId === callerUserId) {
    return { authorized: true, status: 200, isServiceRole: false, userId: callerUserId };
  }

  // 4. Caso o alvo seja outro usuário:
  // REGRA DE SEGURANÇA REFORÇADA:
  // O mero compartilhamento de workspace como colaborador NÃO autoriza disparo para terceiros.
  // Apenas o PROPRIETÁRIO de um workspace pode notificar seus colaboradores gerenciados.
  if (options.allowOwnerDispatch) {
    try {
      const { data: ownedWorkspaces } = await supabaseAdmin
        .from("workspaces")
        .select("id")
        .eq("user_id", callerUserId);

      const ownedWsIds: string[] = (ownedWorkspaces || []).map((w: any) => w.id);
      if (ownedWsIds.length > 0) {
        const { data: targetInOwned } = await supabaseAdmin
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", resolvedTargetId)
          .eq("ativo", true)
          .in("workspace_id", ownedWsIds)
          .limit(1);

        if (targetInOwned && targetInOwned.length > 0) {
          return { authorized: true, status: 200, isServiceRole: false, userId: resolvedTargetId };
        }
      }
    } catch (_wsErr) {
      // Em caso de erro na consulta, bloqueia defensivamente
    }
  }

  // Se o chamador não for o proprietário do workspace do destinatário: nega terminantemente
  return {
    authorized: false,
    status: 403,
    reason: "Forbidden: Colaboradores não possuem permissão para disparar notificações para terceiros",
  };
}
