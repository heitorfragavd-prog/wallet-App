/**
 * Módulo de Segurança Fail-Safe para Confirmação e Sincronização de Preço Eyemobile
 * Local: supabase/functions/_shared/integrations/eyemobile-price-safety.ts
 *
 * Invariantes Garantidas:
 * 1. O estado "aplicado" é estritamente concedido se e somente se:
 *    - Eyemobile retornou HTTP 200 E json.success === true;
 *    - Persistência local (alerta + produto) teve sucesso atômico via RPC (Postgres transaction).
 * 2. Acquire atômico delimita-se por (alerta_id, user_id, workspace_id).
 * 3. Máquina de estados:
 *    pendente / editado / erro_integracao -> aplicando -> (aplicado | erro_integracao)
 * 4. Recuperação de stale lock (> 180s) é atômica no mesmo comando UPDATE.
 * 5. Durante 'aplicando', edições, cancelamentos e novas confirmações concorrentes são bloqueadas.
 * 6. Falha remota ou parcial transiciona estritamente aplicando -> erro_integracao.
 * 7. Logs 100% sanitizados (sem segredos, tokens ou service role).
 * 8. Compatível com Deno e Node/Vitest (sem imports remotos Deno).
 */

export interface AlertaPreco {
  id: string;
  user_id: string;
  workspace_id: string;
  produto_eyemobile_id: string;
  produto_codigo?: string | null;
  produto_descricao?: string | null;
  preco_sugerido?: number | null;
  preco_definido_usuario?: number | null;
  preco_venda_atual?: number | null;
  custo_anterior?: number | null;
  custo_novo?: number | null;
  status: "pendente" | "editado" | "aplicando" | "aplicado" | "erro_integracao" | "ignorado" | string;
  updated_at?: string | null;
  created_at?: string | null;
  data_criacao?: string | null;
  data_resolucao?: string | null;
}

export type AcquireLockResult =
  | { acquired: true; alerta: AlertaPreco }
  | {
      acquired: false;
      reason: "already_applied" | "already_processing" | "not_found" | "db_error";
      alerta?: AlertaPreco;
      error?: string;
    };

export interface PriceSyncResult {
  success: boolean;
  status: number;
  data?: Record<string, unknown>;
  error?: string;
  isNetworkOrTimeout?: boolean;
}

export type GenericDbResult<T = unknown> = {
  data: T;
  error: { message?: string } | null;
};

export interface QueryFilterBuilderLike {
  select: (columns?: string) => PromiseLike<GenericDbResult> & QueryFilterBuilderLike;
  update: (values: Record<string, unknown>) => QueryFilterBuilderLike;
  eq: (column: string, value: unknown) => QueryFilterBuilderLike;
  or: (filter: string) => QueryFilterBuilderLike;
  maybeSingle: () => PromiseLike<GenericDbResult>;
  then: <TResult1 = GenericDbResult, TResult2 = never>(
    onfulfilled?: ((value: GenericDbResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) => PromiseLike<TResult1 | TResult2>;
}

export interface SupabaseClientLike {
  from: (table: string) => QueryFilterBuilderLike;
  rpc: (
    fn: string,
    args?: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
}

export const MSG_FALHA_REMOTO =
  "⚠️ Não foi possível atualizar o preço no Eyemobile.\n" +
  "Nenhuma alteração foi considerada aplicada.\n" +
  "Tente novamente.";

export const MSG_FALHA_PERSISTENCIA_LOCAL =
  "⚠️ O Eyemobile confirmou a alteração do preço, mas o Wallet não conseguiu registrar a sincronização.\n" +
  "Nenhuma alteração foi considerada finalizada no Wallet.\n" +
  "Tente novamente para reconciliar.";

export const MSG_ALERTA_JA_APLICADO =
  "ℹ️ Este preço já foi aplicado anteriormente no Eyemobile.";

export const MSG_EM_PROCESSAMENTO =
  "⏳ A atualização deste preço já está em processamento no Eyemobile. Por favor, aguarde alguns instantes.";

export const MSG_BLOQUEIO_APLICANDO_EDITAR =
  "⏳ Este preço já está sendo aplicado no Eyemobile. Aguarde a conclusão antes de editar.";

export const MSG_BLOQUEIO_APLICANDO_IGNORAR =
  "⏳ Este preço já está sendo aplicado no Eyemobile e não pode ser ignorado no momento.";

/**
 * Contrato rigoroso de sucesso da resposta do Eyemobile
 * Exige status === 200 E json.success === true
 */
export function isEyemobileSuccessResponse(status: number, json: unknown): boolean {
  if (status !== 200 || !json || typeof json !== "object") {
    return false;
  }
  const payload = json as Record<string, unknown>;
  return payload.success === true;
}

/**
 * Acquire atômico de lock no banco de dados.
 * Delimitado estritamente por alertaId, userId e workspaceId.
 * Adquire se status IN ('pendente', 'editado', 'erro_integracao')
 * OU se status = 'aplicando' com updated_at anterior ao staleThreshold (180s).
 */
export async function acquireAlertaLock(
  supabase: unknown,
  params: {
    alertaId: string;
    userId: string;
    workspaceId: string;
    staleThresholdMs?: number;
    nowDate?: Date;
  }
): Promise<AcquireLockResult> {
  const client = supabase as SupabaseClientLike;
  const now = params.nowDate || new Date();
  const nowIso = now.toISOString();
  const staleThresholdMs = params.staleThresholdMs ?? 180000; // 3 minutos
  const staleCutoffIso = new Date(now.getTime() - staleThresholdMs).toISOString();

  try {
    // 1. UPDATE atômico condicional
    // Filtro condicional: (status IN ('pendente','editado','erro_integracao')) OU (status = 'aplicando' AND updated_at < staleCutoff)
    const { data, error } = await client
      .from("alertas_preco_pendentes")
      .update({
        status: "aplicando",
        updated_at: nowIso,
      })
      .eq("id", params.alertaId)
      .eq("user_id", params.userId)
      .eq("workspace_id", params.workspaceId)
      .or(`status.in.(pendente,editado,erro_integracao),and(status.eq.aplicando,updated_at.lt.${staleCutoffIso})`)
      .select("*");

    if (error) {
      return {
        acquired: false,
        reason: "db_error",
        error: error.message || "Erro no banco ao tentar adquirir lock",
      };
    }

    if (Array.isArray(data) && data.length === 1) {
      return {
        acquired: true,
        alerta: data[0] as AlertaPreco,
      };
    }

    // 2. Se nenhuma linha foi adquirida, executa SELECT SOMENTE para classificar o motivo
    const { data: current, error: selectErr } = await client
      .from("alertas_preco_pendentes")
      .select("*")
      .eq("id", params.alertaId)
      .eq("user_id", params.userId)
      .eq("workspace_id", params.workspaceId)
      .maybeSingle();

    if (selectErr || !current) {
      return {
        acquired: false,
        reason: selectErr ? "db_error" : "not_found",
        error: selectErr?.message,
      };
    }

    const currentAlerta = current as AlertaPreco;

    if (currentAlerta.status === "aplicado") {
      return {
        acquired: false,
        reason: "already_applied",
        alerta: currentAlerta,
      };
    }

    if (currentAlerta.status === "aplicando") {
      return {
        acquired: false,
        reason: "already_processing",
        alerta: currentAlerta,
      };
    }

    return {
      acquired: false,
      reason: "not_found",
      alerta: currentAlerta,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Exceção inesperada no acquire";
    return {
      acquired: false,
      reason: "db_error",
      error: errorMsg,
    };
  }
}

/**
 * Chamada fail-safe ao Eyemobile Sync com AbortController (timeout de 25s)
 * Sanitização estrita de credenciais nos logs.
 */
export async function executeEyemobilePriceSync(
  supabaseUrl: string,
  serviceKey: string,
  payload: {
    user_id: string;
    product_id: string;
    new_price: number;
  },
  options?: {
    timeoutMs?: number;
    fetchFn?: typeof fetch;
  }
): Promise<PriceSyncResult> {
  const timeoutMs = options?.timeoutMs ?? 25000; // 25 segundos
  const fetchFn = options?.fetchFn || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const endpoint = `${supabaseUrl}/functions/v1/eyemobile-sync`;

  try {
    const resp = await fetchFn(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "UPDATE_PRODUCT_PRICE",
        user_id: payload.user_id,
        product_id: payload.product_id,
        new_price: payload.new_price,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    let json: Record<string, unknown> | null = null;
    try {
      json = await resp.json();
    } catch {
      json = null;
    }

    const isSuccess = isEyemobileSuccessResponse(resp.status, json);

    if (isSuccess) {
      return {
        success: true,
        status: resp.status,
        data: json || {},
      };
    }

    const errorMsg =
      (json && typeof json.error === "string" ? json.error : undefined) ||
      `Eyemobile retornou status ${resp.status}`;

    return {
      success: false,
      status: resp.status,
      error: errorMsg,
      data: json || undefined,
    };
  } catch (err: unknown) {
    clearTimeout(timer);
    const isAbort =
      (err instanceof Error && err.name === "AbortError") ||
      (typeof err === "object" && err !== null && "name" in err && err.name === "AbortError");

    const reason = isAbort
      ? `Timeout na chamada ao Eyemobile após ${timeoutMs}ms`
      : err instanceof Error
      ? err.message
      : "Falha de rede ao conectar com o Eyemobile";

    return {
      success: false,
      status: isAbort ? 504 : 503,
      error: reason,
      isNetworkOrTimeout: true,
    };
  }
}

/**
 * Persistência atômica do preço confirmado via RPC Postgres aplicar_preco_alerta_eyemobile.
 * Atualiza produtos_eyemobile e transiciona alerta para 'aplicado' na mesma transação.
 */
export async function persistConfirmedPriceAtomic(
  supabase: unknown,
  params: {
    alertaId: string;
    userId: string;
    workspaceId: string;
    novoPreco: number;
  }
): Promise<{ success: boolean; error?: string; data?: unknown }> {
  const client = supabase as SupabaseClientLike;
  try {
    const { data, error } = await client.rpc("aplicar_preco_alerta_eyemobile", {
      p_alerta_id: params.alertaId,
      p_user_id: params.userId,
      p_workspace_id: params.workspaceId,
      p_novo_preco: params.novoPreco,
    });

    if (error) {
      return {
        success: false,
        error: error.message || "Erro na RPC aplicar_preco_alerta_eyemobile",
      };
    }

    if (!data || (typeof data === "object" && data.success !== true)) {
      const errMsg = (data && data.error) ? String(data.error) : "Transação atômica retornou insucesso";
      return {
        success: false,
        error: errMsg,
      };
    }

    return {
      success: true,
      data,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Exceção ao executar persistência atômica";
    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Transição estrita de falha: aplicando -> erro_integracao.
 * Condicionado a id, user_id, workspace_id e status = 'aplicando'.
 * NUNCA sobrescreve estados terminais (aplicado, ignorado).
 */
export async function handlePriceSyncFailure(
  supabase: unknown,
  params: {
    alertaId: string;
    userId: string;
    workspaceId: string;
    reason: string;
    isRemoteSuccessLocalFailure?: boolean;
    nowDate?: Date;
  }
): Promise<{ recorded: boolean; userMessage: string; error?: string }> {
  const client = supabase as SupabaseClientLike;
  const now = params.nowDate || new Date();
  const nowIso = now.toISOString();

  // Log sanitizado
  if (params.isRemoteSuccessLocalFailure) {
    console.error(
      `[eyemobile-price-safety] remote_success_local_failure: alerta ${params.alertaId} teve sucesso no Eyemobile mas falhou na persistência local: ${params.reason}`
    );
  } else {
    console.warn(
      `[eyemobile-price-safety] Falha na integração Eyemobile para alerta ${params.alertaId}: ${params.reason}`
    );
  }

  let recorded = false;
  let dbError: string | undefined;

  try {
    // Transição estrita: status = 'aplicando' -> 'erro_integracao'
    const { data, error } = await client
      .from("alertas_preco_pendentes")
      .update({
        status: "erro_integracao",
        updated_at: nowIso,
      })
      .eq("id", params.alertaId)
      .eq("user_id", params.userId)
      .eq("workspace_id", params.workspaceId)
      .eq("status", "aplicando")
      .select("id");

    if (error) {
      dbError = error.message;
    } else if (Array.isArray(data) && data.length === 1) {
      recorded = true;
    }
  } catch (err: unknown) {
    dbError = err instanceof Error ? err.message : "Exceção ao persistir erro_integracao";
  }

  const userMessage = params.isRemoteSuccessLocalFailure
    ? MSG_FALHA_PERSISTENCIA_LOCAL
    : MSG_FALHA_REMOTO;

  return {
    recorded,
    userMessage,
    error: dbError,
  };
}
