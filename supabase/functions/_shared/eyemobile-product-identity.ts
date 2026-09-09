/**
 * Helper puro de regras de identidade, preflight e planejamento de sincronização
 * para o espelho local `produtos_eyemobile`.
 *
 * Invariantes:
 * - produtos_eyemobile.id é o UUID canônico interno (nunca sobrescrever).
 * - produtos_eyemobile.eyemobile_id é a única autoridade de matching com a Eyemobile remota.
 * - produtos_eyemobile.codigo é metadado comercial e nunca autoridade de identidade remota.
 * - NUNCA faz fallback de codigo para String(prod.id).
 * - Multi-tenant estrito por (user_id, workspace_id).
 * - Constraint legada UNIQUE(user_id, codigo) detectada em preflight sem poluir matching.
 * - Trusted service role exige chave secreta criptográfica estrita (não confia em JWT decodificado).
 */

export interface RawRemoteProduct {
  id?: unknown;
  name?: unknown;
  code?: unknown;
  sku?: unknown;
  price?: unknown;
  sale_price?: unknown;
  cost_price?: unknown;
  cost?: unknown;
  stock?: unknown;
  quantity?: unknown;
  category?: unknown;
  [key: string]: unknown;
}

export interface ValidatedRemoteProduct {
  eyemobileId: string;
  codigo: string | null;
  descricao: string;
  categoria: string;
  precoVenda: number;
  custoAtual: number;
  estoqueAtual: number;
  margemReal: number;
}

export interface LocalProductMirror {
  id: string;
  user_id: string;
  workspace_id: string | null;
  eyemobile_id: string | null;
  codigo: string | null;
  descricao?: string | null;
  categoria?: string | null;
  preco_venda?: number | null;
  custo_atual?: number | null;
  estoque_atual?: number | null;
  margem_real_percentual?: number | null;
  ativo?: boolean | null;
  [key: string]: unknown;
}

export interface PreflightConflict {
  type:
    | "duplicate_remote_id"
    | "invalid_remote_id"
    | "duplicate_local_id"
    | "identity_conflict_code_collision"
    | "legacy_product_code_collision"
    | "cross_workspace_code_collision";
  code?: string | null;
  eyemobileId?: string | null;
  localId?: string | null;
  workspaceId?: string | null;
  message: string;
}

export interface PreflightSuccess {
  ok: true;
  remoteProducts: ValidatedRemoteProduct[];
  toUpdate: Array<{
    localProduct: LocalProductMirror;
    remoteProduct: ValidatedRemoteProduct;
  }>;
  toInsert: ValidatedRemoteProduct[];
  toDeactivate: LocalProductMirror[];
}

export interface PreflightFailure {
  ok: false;
  code: string;
  error: string;
  conflicts: PreflightConflict[];
}

export type PreflightResult = PreflightSuccess | PreflightFailure;

export interface PlanOptions {
  userId: string;
  workspaceId: string;
  /** Produtos de outros workspaces do mesmo usuário exclusivamente para diagnóstico de UNIQUE(user_id, codigo) */
  otherWorkspaceProducts?: LocalProductMirror[];
}

/**
 * Validação estrita de autorização de serviço privilegiado para SYNC_PRODUCTS.
 * NUNCA confia em claims de payload de JWT decodificado sem assinatura.
 * Exige comparação exata com SUPABASE_SERVICE_ROLE_KEY ou CRON_SECRET.
 */
export function isTrustedServiceRoleCaller(
  token: string | null | undefined,
  serviceRoleKey: string | null | undefined,
  cronSecret?: string | null | undefined
): boolean {
  if (!token) return false;
  const cleanToken = token.replace("Bearer ", "").trim();
  if (!cleanToken) return false;

  const matchesServiceKey = Boolean(serviceRoleKey && cleanToken === serviceRoleKey.trim());
  const matchesCronSecret = Boolean(cronSecret && cronSecret.trim().length > 0 && cleanToken === cronSecret.trim());

  return matchesServiceKey || matchesCronSecret;
}

/**
 * Normaliza o ID remoto vindo da API da Eyemobile.
 * Deve ser não-nulo e string não vazia após trim.
 */
export function normalizeRemoteId(id: unknown): string | null {
  if (id === null || id === undefined) return null;
  const str = String(id).trim();
  if (!str) return null;
  return str;
}

/**
 * Normaliza o código comercial do produto remoto.
 * Prioriza prod.code e prod.sku.
 * NUNCA faz fallback para prod.id. Se ausente, retorna null.
 */
export function normalizeRemoteCode(code: unknown, sku: unknown): string | null {
  if (code !== null && code !== undefined) {
    const s = String(code).trim();
    if (s) return s;
  }
  if (sku !== null && sku !== undefined) {
    const s = String(sku).trim();
    if (s) return s;
  }
  return null;
}

/**
 * Calcula a margem real percentual com fallback padrão de 30%.
 */
export function calculateMargemReal(precoVenda: number, custoAtual: number): number {
  let margemReal = 30;
  if (custoAtual > 0 && precoVenda > 0) {
    margemReal = ((precoVenda / custoAtual) - 1) * 100;
    if (margemReal < 0 || !Number.isFinite(margemReal)) margemReal = 30;
  }
  return Number(margemReal.toFixed(2));
}

export type PageValidationSuccess = {
  ok: true;
  items: unknown[];
  hasMore: boolean;
};

export type PageValidationFailure = {
  ok: false;
  code: "invalid_remote_snapshot" | "incomplete_snapshot";
  error: string;
};

export type PageValidationResult = PageValidationSuccess | PageValidationFailure;

/**
 * Valida o payload de uma página retornado pela API da Eyemobile.
 * Contrato:
 * - payload deve ser objeto JSON não-nulo e não-array;
 * - payload.data deve ser estritamente um Array;
 * - has_more deve ser booleano quando presente;
 * - has_more === true + data.length === 0 -> incomplete_snapshot;
 * - payload inválido -> invalid_remote_snapshot;
 * - página válida -> retorna itens raw + hasMore.
 */
export function validateRemoteProductsPage(payload: unknown): PageValidationResult {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      ok: false,
      code: "invalid_remote_snapshot",
      error: "Resposta da Eyemobile não é um objeto JSON válido.",
    };
  }

  const obj = payload as Record<string, unknown>;

  if (!("data" in obj) || !Array.isArray(obj.data)) {
    return {
      ok: false,
      code: "invalid_remote_snapshot",
      error: "Resposta da Eyemobile não contém a propriedade 'data' como array.",
    };
  }

  let hasMore = false;
  if ("has_more" in obj && obj.has_more !== undefined && obj.has_more !== null) {
    if (typeof obj.has_more !== "boolean") {
      return {
        ok: false,
        code: "invalid_remote_snapshot",
        error: "Propriedade 'has_more' da resposta da Eyemobile deve ser do tipo boolean.",
      };
    }
    hasMore = obj.has_more;
  }

  if (hasMore && obj.data.length === 0) {
    return {
      ok: false,
      code: "incomplete_snapshot",
      error: "A API da Eyemobile retornou has_more: true com lista de produtos vazia. Snapshot incompleto.",
    };
  }

  return {
    ok: true,
    items: obj.data,
    hasMore,
  };
}

/**
 * Valida o snapshot remoto completo antes de qualquer decisão ou mutation.
 * Garante que cada produto possui um id válido e que não há duplicidade de ID remoto no snapshot.
 */
export function validateRemoteSnapshot(
  rawList: unknown[]
): { ok: true; products: ValidatedRemoteProduct[] } | { ok: false; code: string; error: string; conflicts: PreflightConflict[] } {
  if (!Array.isArray(rawList)) {
    return {
      ok: false,
      code: "invalid_remote_snapshot",
      error: "O snapshot remoto de produtos não é uma lista válida.",
      conflicts: [
        {
          type: "invalid_remote_id",
          message: "O payload retornado pela API não é uma lista de produtos.",
        },
      ],
    };
  }

  const seenIds = new Set<string>();
  const seenCodes = new Map<string, string>(); // code -> first eyemobileId
  const conflicts: PreflightConflict[] = [];
  const products: ValidatedRemoteProduct[] = [];

  for (let i = 0; i < rawList.length; i++) {
    const raw = rawList[i];
    if (!raw || typeof raw !== "object") {
      conflicts.push({
        type: "invalid_remote_id",
        message: `Item remoto no índice ${i} não é um objeto de produto válido.`,
      });
      continue;
    }

    const prod = raw as RawRemoteProduct;
    const eyemobileId = normalizeRemoteId(prod.id);

    if (!eyemobileId) {
      conflicts.push({
        type: "invalid_remote_id",
        message: `Produto remoto no índice ${i} possui ID inválido ou ausente.`,
      });
      continue;
    }

    if (seenIds.has(eyemobileId)) {
      conflicts.push({
        type: "duplicate_remote_id",
        eyemobileId,
        message: `ID remoto duplicado no snapshot da Eyemobile: "${eyemobileId}".`,
      });
      continue;
    }
    seenIds.add(eyemobileId);

    const codigo = normalizeRemoteCode(prod.code, prod.sku);
    if (codigo) {
      if (seenCodes.has(codigo)) {
        conflicts.push({
          type: "identity_conflict_code_collision",
          code: codigo,
          eyemobileId,
          message: `Código comercial duplicado no snapshot remoto: "${codigo}" compartilhado entre ID ${seenCodes.get(codigo)} e ID ${eyemobileId}.`,
        });
      } else {
        seenCodes.set(codigo, eyemobileId);
      }
    }

    const rawPreco = Number(prod.price ?? prod.sale_price ?? 0);
    const precoVenda = Number.isFinite(rawPreco) && rawPreco >= 0 ? rawPreco : 0;

    const rawCusto = Number(prod.cost_price ?? prod.cost ?? 0);
    const custoAtual = Number.isFinite(rawCusto) && rawCusto > 0
      ? rawCusto
      : (precoVenda > 0 ? precoVenda * 0.7 : 0);

    const rawEstoque = Number(prod.stock ?? prod.quantity ?? 0);
    const estoqueAtual = Number.isFinite(rawEstoque) ? rawEstoque : 0;

    const margemReal = calculateMargemReal(precoVenda, custoAtual);

    const descricao = String(prod.name ?? "").trim() || "Produto sem nome";
    const categoria = String(prod.category ?? "").trim() || "Geral";

    products.push({
      eyemobileId,
      codigo,
      descricao,
      categoria,
      precoVenda,
      custoAtual,
      estoqueAtual,
      margemReal,
    });
  }

  if (conflicts.length > 0) {
    return {
      ok: false,
      code: conflicts[0].type,
      error: conflicts[0].message,
      conflicts,
    };
  }

  return { ok: true, products };
}

/**
 * Executa o preflight e planeja as ações de sincronização:
 * - Detecta duplicidade de eyemobile_id local no mesmo tenant.
 * - Detecta conflito de código entre produtos de IDs remotos distintos.
 * - Detecta colisão de código com produto legado (eyemobile_id null).
 * - Detecta colisão de código com outros workspaces do mesmo usuário (constraint UNIQUE(user_id, codigo)).
 * - Identifica updates preservando o UUID local (produtos_eyemobile.id).
 * - Identifica inserts para produtos novos.
 * - Identifica desativações seguras exclusivamente para produtos do tenant com eyemobile_id que sumiram do snapshot.
 */
export function planProductSync(
  validatedRemote: ValidatedRemoteProduct[],
  localProducts: LocalProductMirror[],
  options: PlanOptions
): PreflightResult {
  const conflicts: PreflightConflict[] = [];

  // 1. Verificar se todos os produtos locais passados pertencem ao tenant correto
  for (const local of localProducts) {
    if (local.user_id !== options.userId || local.workspace_id !== options.workspaceId) {
      return {
        ok: false,
        code: "tenant_isolation_violation",
        error: `Produto local ${local.id} pertence a tenant divergente (user_id=${local.user_id}, workspace_id=${local.workspace_id}).`,
        conflicts: [
          {
            type: "duplicate_local_id",
            localId: local.id,
            message: "Violação de isolamento de tenant na lista de produtos locais.",
          },
        ],
      };
    }
  }

  // 2. Detectar duplicidade local de eyemobile_id no mesmo tenant
  const localByEyemobileId = new Map<string, LocalProductMirror>();
  const seenLocalEyemobileIds = new Set<string>();

  for (const local of localProducts) {
    if (local.eyemobile_id) {
      if (seenLocalEyemobileIds.has(local.eyemobile_id)) {
        conflicts.push({
          type: "duplicate_local_id",
          eyemobileId: local.eyemobile_id,
          localId: local.id,
          message: `Duplicidade local de eyemobile_id encontrada para "${local.eyemobile_id}" no workspace ${options.workspaceId}.`,
        });
      } else {
        seenLocalEyemobileIds.add(local.eyemobile_id);
        localByEyemobileId.set(local.eyemobile_id, local);
      }
    }
  }

  // Índice local por código comercial no workspace atual
  const localByCodigo = new Map<string, LocalProductMirror>();
  for (const local of localProducts) {
    if (local.codigo) {
      if (!localByCodigo.has(local.codigo)) {
        localByCodigo.set(local.codigo, local);
      }
    }
  }

  // Índice diagnóstico de outros workspaces do MESMO usuário (apenas para detectar violação da constraint UNIQUE(user_id, codigo))
  const otherWsByCodigo = new Map<string, LocalProductMirror>();
  if (options.otherWorkspaceProducts) {
    for (const other of options.otherWorkspaceProducts) {
      if (other.user_id === options.userId && other.workspace_id !== options.workspaceId && other.codigo) {
        if (!otherWsByCodigo.has(other.codigo)) {
          otherWsByCodigo.set(other.codigo, other);
        }
      }
    }
  }

  // Se já há duplicidade local de ID, abortar imediatamente
  if (conflicts.length > 0) {
    return {
      ok: false,
      code: conflicts[0].type,
      error: conflicts[0].message,
      conflicts,
    };
  }

  const toUpdate: Array<{
    localProduct: LocalProductMirror;
    remoteProduct: ValidatedRemoteProduct;
  }> = [];
  const toInsert: ValidatedRemoteProduct[] = [];

  // 3. Avaliar cada produto remoto
  for (const remote of validatedRemote) {
    // Diagnóstico de colisão com outros workspaces do mesmo usuário (constraint UNIQUE(user_id, codigo))
    if (remote.codigo) {
      const crossWsMatch = otherWsByCodigo.get(remote.codigo);
      if (crossWsMatch) {
        const wsDesc = crossWsMatch.workspace_id ? `workspace ${crossWsMatch.workspace_id}` : "workspace legado (NULL)";
        conflicts.push({
          type: "cross_workspace_code_collision",
          code: remote.codigo,
          eyemobileId: remote.eyemobileId,
          localId: crossWsMatch.id,
          workspaceId: crossWsMatch.workspace_id,
          message: `Conflito de constraint legada: o código comercial "${remote.codigo}" do produto remoto ${remote.eyemobileId} já existe no ${wsDesc} do mesmo usuário. A constraint UNIQUE(user_id, codigo) impede a inserção/atualização.`,
        });
        continue;
      }
    }

    const localMatch = localByEyemobileId.get(remote.eyemobileId);

    if (localMatch) {
      // Caso A: remote eyemobile_id == local eyemobile_id -> UPDATE
      // Checar se o novo código colide com outro produto local do mesmo workspace
      if (remote.codigo) {
        const productWithSameCode = localByCodigo.get(remote.codigo);
        if (productWithSameCode && productWithSameCode.id !== localMatch.id) {
          conflicts.push({
            type: "identity_conflict_code_collision",
            code: remote.codigo,
            eyemobileId: remote.eyemobileId,
            localId: productWithSameCode.id,
            message: `Conflito de integridade: código "${remote.codigo}" do produto remoto ${remote.eyemobileId} já está em uso pelo produto local ${productWithSameCode.id}.`,
          });
          continue;
        }
      }

      toUpdate.push({
        localProduct: localMatch,
        remoteProduct: remote,
      });
    } else {
      // Caso B: remote eyemobile_id não existe localmente -> INSERT
      // Checar se o código coincide com produto local existente no mesmo workspace
      if (remote.codigo) {
        const productWithSameCode = localByCodigo.get(remote.codigo);
        if (productWithSameCode) {
          if (!productWithSameCode.eyemobile_id) {
            // Caso D: produto legado com eyemobile_id null
            conflicts.push({
              type: "legacy_product_code_collision",
              code: remote.codigo,
              eyemobileId: remote.eyemobileId,
              localId: productWithSameCode.id,
              message: `Conflito de código com produto legado: código "${remote.codigo}" coincide com produto local ${productWithSameCode.id} que possui eyemobile_id nulo. Vinculação automática proibida.`,
            });
            continue;
          } else {
            // Caso C: código coincide mas eyemobile_id é diferente
            conflicts.push({
              type: "identity_conflict_code_collision",
              code: remote.codigo,
              eyemobileId: remote.eyemobileId,
              localId: productWithSameCode.id,
              message: `Conflito de código: produto remoto ${remote.eyemobileId} possui código "${remote.codigo}" já cadastrado para o produto local ${productWithSameCode.id} (eyemobile_id="${productWithSameCode.eyemobile_id}").`,
            });
            continue;
          }
        }
      }

      toInsert.push(remote);
    }
  }

  if (conflicts.length > 0) {
    return {
      ok: false,
      code: conflicts[0].type,
      error: conflicts[0].message,
      conflicts,
    };
  }

  // 4. Planejar desativações seguras
  // Desativar apenas produtos com eyemobile_id preenchido que NÃO estão no snapshot remoto
  const remoteEyemobileIds = new Set(validatedRemote.map((p) => p.eyemobileId));
  const toDeactivate: LocalProductMirror[] = [];

  for (const local of localProducts) {
    // Invariante: se eyemobile_id for nulo, NUNCA desativar
    if (!local.eyemobile_id) continue;

    // Apenas se não está no snapshot e ainda está ativo
    if (!remoteEyemobileIds.has(local.eyemobile_id) && local.ativo !== false) {
      toDeactivate.push(local);
    }
  }

  return {
    ok: true,
    remoteProducts: validatedRemote,
    toUpdate,
    toInsert,
    toDeactivate,
  };
}
