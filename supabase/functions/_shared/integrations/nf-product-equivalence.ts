/**
 * WALLET APP — Correção de Integridade de Produtos — Fase 4
 * Módulo: Resolvedor Edge-Compatible de Equivalência Confirmada de Produtos da NF
 * Arquivo: supabase/functions/_shared/integrations/nf-product-equivalence.ts
 *
 * Responsabilidade Única:
 * Resolver determinística e seguramente:
 *   (user_id, workspace_id, cnpj_fornecedor, codigo_produto_fornecedor)
 *   → produto_equivalencias (confirmado_por_usuario = true)
 *   → produtos_eyemobile canônico
 *
 * Invariantes Centrais:
 * 1. Apenas equivalência confirmada explicitamente (confirmado_por_usuario = true) pode produzir "matched".
 * 2. NUNCA faz matching por descrição textual.
 * 3. NUNCA faz matching entre codigo_produto do fornecedor e produtos_eyemobile.codigo.
 * 4. NUNCA cria produtos_eyemobile (zero ghost products).
 * 5. Fator de conversão deve ser numérico, finito e > 0. NUNCA assume 1.
 * 6. Produto canônico deve pertencer ao mesmo (user_id, workspace_id) e possuir eyemobile_id válido.
 * 7. Mensagens de erro públicas são totalmente sanitizadas.
 */

export interface ProdutoEyemobileRow {
  id: string;
  user_id: string;
  workspace_id: string;
  eyemobile_id: string | null;
  codigo: string | null;
  descricao: string;
  preco_venda: number | null;
  custo_atual: number | null;
  estoque_atual: number | null;
  margem_real_percentual: number | null;
  [key: string]: unknown;
}

export type NfProductResolution =
  | {
      status: "matched";
      equivalenciaId: string;
      produtoEyemobileUuid: string;
      eyemobileId: string;
      fatorConversao: number;
      origem?: string;
      produto: ProdutoEyemobileRow;
    }
  | {
      status: "pending";
      reason:
        | "missing_supplier_cnpj"
        | "missing_supplier_code"
        | "no_confirmed_equivalence"
        | "missing_remote_product_id";
      motivo?: string;
    }
  | {
      status: "error";
      code:
        | "database_error"
        | "invalid_equivalence"
        | "invalid_conversion_factor"
        | "missing_remote_product_id";
      reason: string;
      errorMessage?: string;
    };

export const NF_RESOLVER_ERROR_MESSAGES = {
  database_error: "Falha ao consultar equivalência no banco de dados.",
  invalid_equivalence: "Equivalência de produto inválida ou corrompida.",
  invalid_conversion_factor: "Fator de conversão inválido na equivalência de produto.",
  missing_remote_product_id: "Produto canônico vinculado não possui identificador remoto da Eyemobile.",
} as const;

/**
 * Normaliza o CNPJ do fornecedor mantendo estritamente dígitos numéricos.
 * Ex: "12.345.678/0001-90" -> "12345678000190"
 */
export function normalizeSupplierCnpj(cnpj?: string | null): string | null {
  if (!cnpj) return null;
  const digits = String(cnpj).replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

/**
 * Normaliza o código do fornecedor (cProd da NF).
 * Aplica estritamente trim(), preservando maiúsculas/minúsculas e pontuação original.
 */
export function normalizeSupplierCode(code?: string | null): string | null {
  if (code === null || code === undefined) return null;
  const s = String(code).trim();
  return s.length > 0 ? s : null;
}

/**
 * Resolve a equivalência confirmada de um produto da NF contra o cadastro de produtos Eyemobile.
 * Pure Edge Resolver sem dependências de frontend.
 */
export async function resolveNfProductEquivalence(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  params: {
    userId: string;
    workspaceId: string;
    cnpjFornecedor?: string | null;
    codigoProdutoFornecedor?: string | null;
    itemCodigo?: string | null;
    itemDescricao?: string | null;
  }
): Promise<NfProductResolution> {
  const { userId, workspaceId, cnpjFornecedor, codigoProdutoFornecedor, itemCodigo } = params;

  if (!userId || !workspaceId) {
    const msg = NF_RESOLVER_ERROR_MESSAGES.invalid_equivalence;
    return {
      status: "error",
      code: "invalid_equivalence",
      reason: msg,
      errorMessage: msg,
    };
  }

  const cnpjNorm = normalizeSupplierCnpj(cnpjFornecedor);
  if (!cnpjNorm) {
    return {
      status: "pending",
      reason: "missing_supplier_cnpj",
      motivo: "Item da NF não possui CNPJ do fornecedor informado.",
    };
  }

  const codNorm = normalizeSupplierCode(codigoProdutoFornecedor || itemCodigo);
  if (!codNorm) {
    return {
      status: "pending",
      reason: "missing_supplier_code",
      motivo: "Item da NF não possui código de produto do fornecedor informado.",
    };
  }

  // 1. Consultar produto_equivalencias estritamente por tenant e dados normalizados
  const { data: equiv, error: equivError } = await client
    .from("produto_equivalencias")
    .select("id, user_id, workspace_id, produto_eyemobile_uuid, fator_conversao, confirmado_por_usuario")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .eq("cnpj_fornecedor_normalizado", cnpjNorm)
    .eq("codigo_produto_fornecedor", codNorm)
    .eq("confirmado_por_usuario", true)
    .maybeSingle();

  if (equivError) {
    console.error("[nf-product-equivalence] Erro de banco ao consultar equivalência:", equivError);
    return {
      status: "error",
      code: "database_error",
      reason: NF_RESOLVER_ERROR_MESSAGES.database_error,
      errorMessage: NF_RESOLVER_ERROR_MESSAGES.database_error,
    };
  }

  if (!equiv) {
    return {
      status: "pending",
      reason: "no_confirmed_equivalence",
      motivo: "Item da NF não possui equivalência confirmada no cadastro.",
    };
  }

  // 2. Validar fator de conversão (fail closed se nulo, zero, negativo ou NaN)
  const fatorRaw = equiv.fator_conversao;
  const fator = Number(fatorRaw);

  if (
    fatorRaw === null ||
    fatorRaw === undefined ||
    isNaN(fator) ||
    !isFinite(fator) ||
    fator <= 0
  ) {
    console.error(`[nf-product-equivalence] Fator de conversão inválido (${fatorRaw}) na equivalência ${equiv.id}`);
    return {
      status: "error",
      code: "invalid_conversion_factor",
      reason: NF_RESOLVER_ERROR_MESSAGES.invalid_conversion_factor,
      errorMessage: NF_RESOLVER_ERROR_MESSAGES.invalid_conversion_factor,
    };
  }

  // 3. Validar UUID do produto canônico
  if (!equiv.produto_eyemobile_uuid || typeof equiv.produto_eyemobile_uuid !== "string") {
    console.error(`[nf-product-equivalence] produto_eyemobile_uuid ausente na equivalência ${equiv.id}`);
    return {
      status: "error",
      code: "invalid_equivalence",
      reason: NF_RESOLVER_ERROR_MESSAGES.invalid_equivalence,
      errorMessage: NF_RESOLVER_ERROR_MESSAGES.invalid_equivalence,
    };
  }

  // 4. Buscar produto canônico em produtos_eyemobile com tenant isolation estrito
  const { data: prod, error: prodError } = await client
    .from("produtos_eyemobile")
    .select("*")
    .eq("id", equiv.produto_eyemobile_uuid)
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (prodError) {
    console.error("[nf-product-equivalence] Erro de banco ao consultar produto canônico:", prodError);
    return {
      status: "error",
      code: "database_error",
      reason: NF_RESOLVER_ERROR_MESSAGES.database_error,
      errorMessage: NF_RESOLVER_ERROR_MESSAGES.database_error,
    };
  }

  if (!prod) {
    console.error(`[nf-product-equivalence] Produto canônico ${equiv.produto_eyemobile_uuid} não encontrado no workspace ${workspaceId}`);
    return {
      status: "error",
      code: "invalid_equivalence",
      reason: NF_RESOLVER_ERROR_MESSAGES.invalid_equivalence,
      errorMessage: NF_RESOLVER_ERROR_MESSAGES.invalid_equivalence,
    };
  }

  // 5. Validar eyemobile_id remoto (obrigatório para matched)
  const remoteId = prod.eyemobile_id ? String(prod.eyemobile_id).trim() : null;
  if (!remoteId) {
    console.error(`[nf-product-equivalence] Produto canônico ${prod.id} não possui eyemobile_id válido.`);
    return {
      status: "error",
      code: "missing_remote_product_id",
      reason: NF_RESOLVER_ERROR_MESSAGES.missing_remote_product_id,
      errorMessage: NF_RESOLVER_ERROR_MESSAGES.missing_remote_product_id,
    };
  }

  return {
    status: "matched",
    equivalenciaId: equiv.id,
    produtoEyemobileUuid: prod.id,
    eyemobileId: remoteId,
    fatorConversao: fator,
    origem: "equivalencia_confirmada",
    produto: prod as ProdutoEyemobileRow,
  };
}

// ═══════════════════════════════════════════════════════════════════
// FASE 5: CANDIDATOS, SUGESTÕES E APRENDIZADO DE EQUIVALÊNCIAS
// ═══════════════════════════════════════════════════════════════════

export interface ProductCandidate {
  id: string;
  descricao: string;
  codigo: string | null;
  eyemobileId: string | null;
  precoVenda: number | null;
  score: number;
}

/**
 * Remove acentos e caracteres especiais para comparação textual uniforme.
 */
export function normalizeText(text?: string | null): string {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Extrai tokens relevantes (palavras >= 2 caracteres alfanuméricos).
 */
export function extractSearchTokens(text?: string | null): string[] {
  const norm = normalizeText(text);
  if (!norm) return [];
  return norm
    .split(/[\s,./\-_+*()[\]]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

/**
 * Calcula score de similaridade heurística (0.0 a 1.0) entre duas descrições.
 * Usado ESTRITAMENTE para ordenação/sugestão de candidatos ao usuário.
 * NUNCA confirma automaticamente.
 */
export function calculateCandidateSimilarity(textA: string, textB: string): number {
  const normA = normalizeText(textA);
  const normB = normalizeText(textB);

  if (!normA || !normB) return 0;
  if (normA === normB) return 1.0;

  const tokensA = new Set(extractSearchTokens(textA));
  const tokensB = new Set(extractSearchTokens(textB));

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let commonCount = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) commonCount++;
  }

  const unionSize = new Set([...tokensA, ...tokensB]).size;
  const jaccard = unionSize > 0 ? commonCount / unionSize : 0;
  const minSize = Math.min(tokensA.size, tokensB.size);
  const overlap = minSize > 0 ? commonCount / minSize : 0;

  let substringBonus = 0;
  if (normA.includes(normB) || normB.includes(normA)) {
    substringBonus = 0.2;
  }

  const rawScore = (jaccard * 0.5) + (overlap * 0.5) + substringBonus;
  return Math.round(Math.min(0.95, rawScore) * 100) / 100;
}

/**
 * Busca candidatos no catálogo de produtos Eyemobile delimitados por workspace/user.
 * Suporta ordenação por similaridade com a descrição do item da NF.
 * Retorna até `limit` candidatos ordenados (padrão 5).
 */
export async function searchProductCandidates(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  params: {
    userId: string;
    workspaceId: string;
    descricaoQuery?: string | null;
    codigoQuery?: string | null;
    limit?: number;
  }
): Promise<{ ok: true; candidates: ProductCandidate[] } | { ok: false; error: string }> {
  const { userId, workspaceId, descricaoQuery, codigoQuery, limit = 5 } = params;

  if (!userId || !workspaceId) {
    return { ok: false, error: "Identificadores de tenant (userId/workspaceId) obrigatórios." };
  }

  let query = client
    .from("produtos_eyemobile")
    .select("id, descricao, codigo, eyemobile_id, preco_venda, workspace_id, user_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);

  // Se houver busca por código exato, prioriza busca direta
  const codNorm = codigoQuery ? String(codigoQuery).trim() : null;
  if (codNorm) {
    query = query.ilike("codigo", `%${codNorm}%`);
  }

  const { data: rows, error } = await query;

  if (error) {
    console.error("[nf-product-equivalence] Erro ao buscar candidatos de produtos:", error);
    return { ok: false, error: "Falha de banco ao buscar candidatos de produtos." };
  }

  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    // Se não encontrou por código e havia filtro de código, tenta carregar geral para ranking por descrição
    if (codNorm && descricaoQuery) {
      return searchProductCandidates(client, { userId, workspaceId, descricaoQuery, limit });
    }
    return { ok: true, candidates: [] };
  }

  const candidates: ProductCandidate[] = [];

  for (const raw of rows) {
    // Defesa em profundidade: tenant isolation
    if (raw.workspace_id !== workspaceId || raw.user_id !== userId) continue;

    const desc = String(raw.descricao || "");
    let score = 0.5;

    if (descricaoQuery && descricaoQuery.trim().length > 0) {
      score = calculateCandidateSimilarity(descricaoQuery, desc);
    }

    candidates.push({
      id: raw.id,
      descricao: desc,
      codigo: raw.codigo ? String(raw.codigo).trim() : null,
      eyemobileId: raw.eyemobile_id ? String(raw.eyemobile_id).trim() : null,
      precoVenda: raw.preco_venda != null ? Number(raw.preco_venda) : null,
      score,
    });
  }

  // Ordenar determinística: maior score primeiro, depois ordem alfabética da descrição
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.descricao.localeCompare(b.descricao);
  });

  return {
    ok: true,
    candidates: candidates.slice(0, Math.max(1, limit)),
  };
}

/**
 * Sugere um fator de conversão com base na unidade e na descrição do item da NF.
 * REGRAS:
 * 1. Para embalagens (CX, FD, PACK, FARDO, CAIXA, CPJ):
 *    - Tenta extrair quantidade da descrição (ex: 'CX12' -> 12, 'FARDO 6' -> 6).
 *    - Se não encontrar, retorna null (nunca assume 1).
 * 2. Para unidades individuais (UN, LT, KG, PCT):
 *    - Retorna 1 como sugestão para confirmação explícita do usuário.
 * 3. O valor retornado é SOMENTE UMA SUGESTÃO. Nunca confirma automaticamente.
 */
export function suggestConversionFactor(
  unidade?: string | null,
  descricao?: string | null
): number | null {
  const uNorm = (unidade || "").toUpperCase().trim();
  const dNorm = (descricao || "").toUpperCase().trim();

  const ehEmbalagem = ["CX", "FD", "PACK", "FARDO", "CAIXA", "CPJ"].includes(uNorm);

  if (ehEmbalagem) {
    // Procura padrões como CX12, CX 12, FARDO 6, PACK 24, CPJ 12
    const patterns = [
      /(?:CX|CAIXA|FD|FARDO|PACK|CPJ)\s*(\d+)/i,
      /\bC\/?X\s*(\d+)\b/i,
      /\bC\/?X(\d+)\b/i,
      /\b(\d+)\s*(?:UN|UNIDADES|LATAS|GTS|GRF)\b/i,
      /\bX\s*(\d+)\b/i,
    ];

    for (const pat of patterns) {
      const match = dNorm.match(pat);
      if (match && match[1]) {
        const parsed = parseInt(match[1], 10);
        if (parsed > 1) return parsed;
      }
    }

    return null; // Não assume 1 para embalagens
  }

  // Unidades simples sugerem fator 1 (que ainda exige confirmação do usuário)
  if (["UN", "UND", "UNID", "LATA", "GFA", "GARRAFA", "PCT", "PACOTE"].includes(uNorm)) {
    return 1;
  }

  return null;
}

/**
 * Salva ou atualiza uma equivalência confirmada explicitamente pelo usuário em produto_equivalencias.
 * Garante idempotência, proteção contra sobrescrita de vínculo divergente e integridade multi-tenant.
 */
export async function salvarEquivalenciaConfirmada(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  params: {
    userId: string;
    workspaceId: string;
    cnpjFornecedor: string;
    codigoProdutoFornecedor: string;
    produtoEyemobileUuid: string;
    fatorConversao: number;
    fornecedorNome?: string | null;
    descricaoFornecedor?: string | null;
    unidadeFornecedor?: string | null;
  }
): Promise<
  | { success: true; equivalenciaId: string; status: "saved" | "idempotent" }
  | { success: false; code: "invalid_input" | "tenant_mismatch" | "already_confirmed_different" | "database_error"; error: string }
> {
  const {
    userId,
    workspaceId,
    cnpjFornecedor,
    codigoProdutoFornecedor,
    produtoEyemobileUuid,
    fatorConversao,
    fornecedorNome,
    descricaoFornecedor,
    unidadeFornecedor,
  } = params;

  if (!userId || !workspaceId || !produtoEyemobileUuid) {
    return { success: false, code: "invalid_input", error: "Identificadores de usuário, workspace e produto são obrigatórios." };
  }

  const cnpjNorm = normalizeSupplierCnpj(cnpjFornecedor);
  if (!cnpjNorm) {
    return { success: false, code: "invalid_input", error: "CNPJ do fornecedor inválido ou ausente." };
  }

  const codNorm = normalizeSupplierCode(codigoProdutoFornecedor);
  if (!codNorm) {
    return { success: false, code: "invalid_input", error: "Código do produto do fornecedor inválido ou ausente." };
  }

  const fator = Number(fatorConversao);
  if (isNaN(fator) || !isFinite(fator) || fator <= 0) {
    return { success: false, code: "invalid_input", error: "Fator de conversão deve ser estritamente maior que zero." };
  }

  // 1. Validar que o produto canônico existe e pertence ao mesmo tenant
  const { data: prod, error: prodErr } = await client
    .from("produtos_eyemobile")
    .select("id, workspace_id, user_id, eyemobile_id")
    .eq("id", produtoEyemobileUuid)
    .maybeSingle();

  if (prodErr || !prod) {
    return { success: false, code: "tenant_mismatch", error: "Produto do PDV não encontrado no cadastro." };
  }

  if (prod.workspace_id !== workspaceId || prod.user_id !== userId) {
    return { success: false, code: "tenant_mismatch", error: "O produto selecionado não pertence a este usuário ou workspace." };
  }

  // 2. Verificar se já existe registro em produto_equivalencias
  const { data: existing, error: existErr } = await client
    .from("produto_equivalencias")
    .select("id, produto_eyemobile_uuid, fator_conversao, confirmado_por_usuario")
    .eq("workspace_id", workspaceId)
    .eq("cnpj_fornecedor_normalizado", cnpjNorm)
    .eq("codigo_produto_fornecedor", codNorm)
    .maybeSingle();

  if (existErr) {
    console.error("[nf-product-equivalence] Erro ao consultar equivalência existente:", existErr);
    return { success: false, code: "database_error", error: "Falha técnica ao verificar vínculo existente no banco." };
  }

  // 3. Caso já exista vínculo confirmado:
  if (existing && existing.confirmado_por_usuario === true) {
    const mesmoProduto = existing.produto_eyemobile_uuid === produtoEyemobileUuid;
    const mesmoFator = Math.abs(Number(existing.fator_conversao) - fator) < 1e-6;

    if (mesmoProduto && mesmoFator) {
      // Idempotência perfeita: mesmo vínculo confirmado
      return { success: true, equivalenciaId: existing.id, status: "idempotent" };
    }

    // Bloqueio seguro: não sobrescreve vínculo confirmado divergente silenciosamente
    return {
      success: false,
      code: "already_confirmed_different",
      error: "Já existe um vínculo confirmado para este produto do fornecedor (apontando para outro item ou outro fator).",
    };
  }

  // 4. Caso exista vínculo pendente (não confirmado) ou não exista:
  if (existing) {
    // Atualiza o registro pendente para confirmado com os dados explicitamente escolhidos
    const { data: updated, error: updErr } = await client
      .from("produto_equivalencias")
      .update({
        user_id: userId,
        produto_eyemobile_uuid: produtoEyemobileUuid,
        fator_conversao: fator,
        fornecedor_nome: fornecedorNome || null,
        descricao_fornecedor: descricaoFornecedor || null,
        unidade_fornecedor: unidadeFornecedor || null,
        origem_matching: "manual",
        confirmado_por_usuario: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("id")
      .single();

    if (updErr || !updated) {
      console.error("[nf-product-equivalence] Erro ao atualizar equivalência pendente:", updErr);
      return { success: false, code: "database_error", error: "Falha ao gravar confirmação do vínculo." };
    }

    return { success: true, equivalenciaId: updated.id, status: "saved" };
  }

  // Caso não exista: insere nova equivalência confirmada
  const { data: inserted, error: insErr } = await client
    .from("produto_equivalencias")
    .insert({
      user_id: userId,
      workspace_id: workspaceId,
      cnpj_fornecedor_normalizado: cnpjNorm,
      codigo_produto_fornecedor: codNorm,
      fornecedor_nome: fornecedorNome || null,
      descricao_fornecedor: descricaoFornecedor || null,
      unidade_fornecedor: unidadeFornecedor || null,
      produto_eyemobile_uuid: produtoEyemobileUuid,
      fator_conversao: fator,
      origem_matching: "manual",
      confirmado_por_usuario: true,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    // Se colidiu com concorrência no insert (constraint única)
    if (insErr?.code === "23505") {
      const { data: recheck } = await client
        .from("produto_equivalencias")
        .select("id, produto_eyemobile_uuid, fator_conversao, confirmado_por_usuario")
        .eq("workspace_id", workspaceId)
        .eq("cnpj_fornecedor_normalizado", cnpjNorm)
        .eq("codigo_produto_fornecedor", codNorm)
        .maybeSingle();

      if (recheck && recheck.confirmado_por_usuario) {
        return { success: true, equivalenciaId: recheck.id, status: "idempotent" };
      }
    }

    console.error("[nf-product-equivalence] Erro ao inserir nova equivalência:", insErr);
    return { success: false, code: "database_error", error: "Falha ao inserir novo vínculo de produto." };
  }

  return { success: true, equivalenciaId: inserted.id, status: "saved" };
}
