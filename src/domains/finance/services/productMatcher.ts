/**
 * WALLET APP — Correção de Integridade de Produtos — Fase 2
 * Módulo: Matcher Seguro e Determinístico de Produtos
 * Arquivo: src/domains/finance/services/productMatcher.ts
 *
 * Princípios e Invariantes Centrais:
 * 1. A única identidade interna canônica é produtos_eyemobile.id (UUID),
 *    tratada como produto_eyemobile_uuid. O ID remoto é produtos_eyemobile.eyemobile_id.
 * 2. MATCHING AUTOMÁTICO RESTRITO:
 *    Apenas ocorre com equivalência confirmada na tabela produto_equivalencias
 *    (workspace_id + user_id + cnpj_fornecedor_normalizado + codigo_produto_fornecedor + confirmado_por_usuario = true).
 * 3. EQUIVALÊNCIA NÃO CONFIRMADA (confirmado_por_usuario = false):
 *    NUNCA produz status "matched". É tratada estritamente como sugestão prioritária.
 * 4. DESCRIÇÃO NUNCA PRODUZ MATCH:
 *    Mesmo descrição 100% idêntica produz apenas status "suggestion", NUNCA "matched".
 * 5. CÓDIGO COINCIDENTE NÃO PRODUZ MATCH:
 *    produtos_eyemobile.codigo === nf_item.codigo_produto NUNCA produz match automático
 *    sem equivalência confirmada, pois os códigos têm semânticas e origens distintas.
 * 6. TENANT ISOLATION:
 *    Todas as buscas são estritamente delimitadas por workspace_id e user_id (defense-in-depth).
 * 7. OPERAÇÃO PURA (READ-ONLY):
 *    Nenhuma mutação operacional é realizada (sem escrita em estoque, custo, preço ou equivalências).
 * 8. EAN / GTIN:
 *    Não está padronizado ou persistido bilateralmente no momento. O campo é aceito no input
 *    para compatibilidade futura, mas NÃO é utilizado para resolução nesta fase.
 */

import { supabase as defaultSupabase } from "@/integrations/supabase/client";

// ─── CONTRATO DE ENTRADA DO MATCHER ──────────────────────────────
export interface ProductMatchInput {
  userId: string;
  workspaceId: string;
  fornecedorCnpj?: string | null;
  codigoFornecedor?: string | null;
  descricao?: string | null;
  unidadeFornecedor?: string | null;
  /**
   * NOTA SOBRE EAN/GTIN:
   * EAN/GTIN ainda não está padronizado e persistido bilateralmente em produtos_eyemobile
   * e produto_equivalencias. Portanto, nesta Fase 2, o campo eanGtin é recebido no input
   * para compatibilidade de assinatura, mas NÃO é utilizado para matching automático.
   */
  eanGtin?: string | null;
}

// ─── CONTRATO DE SUGESTÃO ─────────────────────────────────────────
export interface ProductSuggestion {
  produtoEyemobileUuid: string;
  eyemobileId: string;
  codigo: string | null;
  descricao: string;
  score?: number;
}

// ─── CONTRATO DE RESULTADO DO MATCHER ─────────────────────────────
export type ProductMatchResult =
  | {
      status: "matched";
      source: "confirmed_equivalence";
      produtoEyemobileUuid: string;
      eyemobileId: string;
      fatorConversao: number;
    }
  | {
      status: "suggestion";
      suggestions: ProductSuggestion[];
    }
  | {
      status: "not_found";
    }
  | {
      status: "invalid_input";
      reason: string;
    };

// ─── INTERFACES DE BANCO (DUCK-TYPED PARA TESTABILIDADE) ─────────
export interface GenericDbResult<T = unknown> {
  data: T;
  error: { message?: string } | null;
}

export interface QueryFilterBuilderLike {
  select: (columns?: string) => QueryFilterBuilderLike;
  eq: (column: string, value: unknown) => QueryFilterBuilderLike;
  limit?: (count: number) => QueryFilterBuilderLike;
  maybeSingle: () => PromiseLike<GenericDbResult<unknown>>;
  then: <TResult1 = GenericDbResult<unknown>, TResult2 = never>(
    onfulfilled?: ((value: GenericDbResult<unknown>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) => PromiseLike<TResult1 | TResult2>;
}

export interface SupabaseClientLike {
  from: (table: string) => QueryFilterBuilderLike;
}

// ─── HELPERS PUROS DE NORMALIZAÇÃO ───────────────────────────────

/**
 * Normaliza o CNPJ do fornecedor:
 * - Remove quaisquer caracteres não numéricos.
 * - Retorna apenas os dígitos ou null se inválido/vazio.
 * Exemplo: "12.345.678/0001-90" -> "12345678000190"
 */
export function normalizeCnpj(cnpj?: string | null): string | null {
  if (!cnpj || typeof cnpj !== "string") return null;
  const digits = cnpj.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

/**
 * Normalização do código de produto do fornecedor:
 * Decisão técnica de normalização:
 * Aplicamos estritamente trim(), preservando o case original.
 * Justificativa: SKUs de fornecedores podem conter caracteres sensíveis a maiúsculas/minúsculas
 * (ex: 'sk-1' vs 'SK-1' em catálogos distintos) ou códigos alfanuméricos complexos.
 * Evitamos uppercase forçado ou remoção de pontuações de código para não gerar falsas equivalências.
 */
export function normalizeCodigoFornecedor(codigo?: string | null): string | null {
  if (!codigo || typeof codigo !== "string") return null;
  const trimmed = codigo.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Normaliza descrição textual para indexação e busca de similaridade:
 * - Remove acentos / diacríticos.
 * - Converte para minúsculas.
 * - Separa números e unidades coladas (ex: "330ml" -> "330 ml", "1kg" -> "1 kg").
 * - Remove caracteres especiais exceto espaços e alfanuméricos.
 * - Colapsa espaços múltiplos.
 */
export function normalizeDescricao(descricao?: string | null): string {
  if (!descricao || typeof descricao !== "string") return "";
  return descricao
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/(\d+)([a-z]+)/g, "$1 $2")
    .replace(/([a-z]+)(\d+)/g, "$1 $2")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Stop words comuns em português para descrições de produtos.
 */
const STOP_WORDS = new Set([
  "de", "da", "do", "das", "dos", "com", "sem", "em", "para", "por",
  "e", "a", "o", "as", "os", "un", "und", "cx", "cxa", "kg", "g",
  "gr", "ml", "l", "lt", "pct", "pcte"
]);

/**
 * Extrai tokens significativos de uma descrição normalizada.
 */
export function extractProductTokens(normalizedDesc: string): Set<string> {
  const tokens = normalizedDesc
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
  return new Set(tokens);
}

/**
 * Calcula a similaridade textual pura entre duas descrições de produto (0 a 1).
 * Utiliza sobreposição de tokens significativos (Jaccard + Overlap) ponderada por inclusão de substring.
 */
export function calculateDescriptionSimilarity(descA: string, descB: string): number {
  const normA = normalizeDescricao(descA);
  const normB = normalizeDescricao(descB);

  if (!normA || !normB) return 0;
  if (normA === normB) return 0.99; // Identidade exata (nunca 1.0 para manter semântica estrita de sugestão)

  const tokensA = extractProductTokens(normA);
  const tokensB = extractProductTokens(normB);

  if (tokensA.size === 0 || tokensB.size === 0) {
    // Fallback para inclusão simples de substring
    if (normA.includes(normB) || normB.includes(normA)) {
      return 0.5;
    }
    return 0;
  }

  let intersectionCount = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersectionCount++;
    }
  }

  const unionCount = new Set([...tokensA, ...tokensB]).size;
  const jaccard = unionCount > 0 ? intersectionCount / unionCount : 0;
  const minSize = Math.min(tokensA.size, tokensB.size);
  const overlap = minSize > 0 ? intersectionCount / minSize : 0;

  // Bônus se uma descrição completa contiver a outra
  let substringBonus = 0;
  if (normA.includes(normB) || normB.includes(normA)) {
    substringBonus = 0.2;
  }

  const score = Math.min(0.95, (jaccard * 0.5) + (overlap * 0.5) + substringBonus);
  return Math.round(score * 100) / 100;
}

// ─── FUNÇÃO PURA DE BUSCA DE SUGESTÕES ────────────────────────────

export interface CandidateProductRow {
  id: string;
  eyemobile_id: string;
  codigo?: string | null;
  descricao: string;
  user_id: string;
  workspace_id: string;
}

/**
 * Localiza sugestões de produtos Eyemobile a partir de descrição textual e/ou candidato pendente.
 * Retorna no máximo entre 3 e 5 sugestões, ordenadas por score de relevância.
 * NUNCA efetua escolha automática e NUNCA grava equivalência.
 */
export async function findProductSuggestions(
  workspaceId: string,
  userId: string,
  descricaoQuery?: string | null,
  pendingCandidate?: CandidateProductRow | null,
  client: SupabaseClientLike = defaultSupabase as unknown as SupabaseClientLike
): Promise<ProductSuggestion[]> {
  // Query de candidatos delimitada estritamente por workspace_id e user_id
  const { data: candidates, error } = await client
    .from("produtos_eyemobile")
    .select("id, eyemobile_id, codigo, descricao, user_id, workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);

  if (error || !candidates || !Array.isArray(candidates)) {
    return [];
  }

  const suggestions: ProductSuggestion[] = [];
  const seenUuids = new Set<string>();

  // 1. Se houver candidato de equivalência pendente (confirmado_por_usuario = false),
  // ele é inserido como primeira sugestão com score de prioridade alta.
  if (pendingCandidate) {
    // Validar isolamento tenant do candidato pendente
    if (
      pendingCandidate.workspace_id === workspaceId &&
      pendingCandidate.user_id === userId
    ) {
      suggestions.push({
        produtoEyemobileUuid: pendingCandidate.id,
        eyemobileId: pendingCandidate.eyemobile_id,
        codigo: pendingCandidate.codigo ?? null,
        descricao: pendingCandidate.descricao,
        score: 0.90, // Sugestão prioritária por existência de vínculo prévio não confirmado
      });
      seenUuids.add(pendingCandidate.id);
    }
  }

  // 2. Pontuar demais candidatos por similaridade textual se houver descrição informada
  if (descricaoQuery && descricaoQuery.trim().length > 0) {
    const scoredCandidates: ProductSuggestion[] = [];

    for (const raw of candidates) {
      const prod = raw as CandidateProductRow;
      if (!prod || !prod.id || seenUuids.has(prod.id)) continue;

      // Defesa em profundidade de isolamento tenant
      if (prod.workspace_id !== workspaceId || prod.user_id !== userId) continue;

      const score = calculateDescriptionSimilarity(descricaoQuery, prod.descricao);
      if (score >= 0.15) {
        scoredCandidates.push({
          produtoEyemobileUuid: prod.id,
          eyemobileId: prod.eyemobile_id,
          codigo: prod.codigo ?? null,
          descricao: prod.descricao,
          score,
        });
      }
    }

    // Ordenar de forma determinística por score decrescente e descrição alfabética
    scoredCandidates.sort((a, b) => {
      const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
      if (Math.abs(scoreDiff) > 0.001) return scoreDiff;
      return a.descricao.localeCompare(b.descricao);
    });

    for (const candidate of scoredCandidates) {
      if (suggestions.length >= 5) break;
      suggestions.push(candidate);
      seenUuids.add(candidate.produtoEyemobileUuid);
    }
  }

  // Limite estrito de no máximo 5 sugestões
  return suggestions.slice(0, 5);
}

// ─── FLUXO PRINCIPAL DO MATCHER SEGURO ────────────────────────────

/**
 * Executa o matching seguro e determinístico de um item de NF/fornecedor.
 *
 * Passos executados:
 * 1. Validação estrita de parâmetros obrigatórios de tenant (userId, workspaceId).
 * 2. Normalização conservadora de CNPJ e código do fornecedor.
 * 3. Busca de equivalência confirmada na tabela produto_equivalencias:
 *    - Se confirmada (confirmado_por_usuario = true):
 *      Resolve o produto canônico correspondente em produtos_eyemobile e retorna "matched"
 *      com fator_conversao da equivalência.
 *    - Se não confirmada (confirmado_por_usuario = false):
 *      NUNCA retorna "matched". Promove para o fluxo de sugestão.
 * 4. Se não houver equivalência confirmada:
 *    - Busca sugestões baseadas na descrição do item ou equivalência pendente.
 *    - Se encontrar candidatos relevantes: retorna "suggestion" (máximo 5).
 *    - Se não encontrar nenhum candidato: retorna "not_found".
 *
 * PROIBIÇÕES E GARANTIAS:
 * - NENHUMA mutação em banco é realizada.
 * - NENHUM match automático por código idêntico ou descrição similar.
 */
export async function matchProduct(
  input: ProductMatchInput,
  client: SupabaseClientLike = defaultSupabase as unknown as SupabaseClientLike
): Promise<ProductMatchResult> {
  // ─── 1. VALIDAÇÃO DE ENTRADA ───────────────────────────────────
  if (!input.userId || typeof input.userId !== "string" || input.userId.trim() === "") {
    return { status: "invalid_input", reason: "userId é obrigatório e não pode ser vazio." };
  }

  if (!input.workspaceId || typeof input.workspaceId !== "string" || input.workspaceId.trim() === "") {
    return { status: "invalid_input", reason: "workspaceId é obrigatório e não pode ser vazio." };
  }

  const userId = input.userId.trim();
  const workspaceId = input.workspaceId.trim();

  const cnpjNormalizado = normalizeCnpj(input.fornecedorCnpj);
  const codigoNormalizado = normalizeCodigoFornecedor(input.codigoFornecedor);
  const temDescricao = typeof input.descricao === "string" && input.descricao.trim().length > 0;

  // Sem fornecedor/código e sem descrição, não há base para resolução
  if ((!cnpjNormalizado || !codigoNormalizado) && !temDescricao) {
    return {
      status: "invalid_input",
      reason: "Dados insuficientes para matching: fornecedor/código ou descrição são necessários.",
    };
  }

  let pendingCandidateRow: CandidateProductRow | null = null;

  // ─── 2. BUSCA EM produto_equivalencias ─────────────────────────
  if (cnpjNormalizado && codigoNormalizado) {
    const { data: equivRow, error: equivError } = await client
      .from("produto_equivalencias")
      .select("id, user_id, workspace_id, produto_eyemobile_uuid, fator_conversao, confirmado_por_usuario")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .eq("cnpj_fornecedor_normalizado", cnpjNormalizado)
      .eq("codigo_produto_fornecedor", codigoNormalizado)
      .maybeSingle();

    if (!equivError && equivRow) {
      // Defesa em profundidade multi-tenant: validação explícita no código
      const isSameTenant =
        equivRow.workspace_id === workspaceId && equivRow.user_id === userId;

      if (isSameTenant && equivRow.produto_eyemobile_uuid) {
        // Buscar o produto canônico correspondente
        const { data: prodRow, error: prodError } = await client
          .from("produtos_eyemobile")
          .select("id, eyemobile_id, codigo, descricao, user_id, workspace_id")
          .eq("id", equivRow.produto_eyemobile_uuid)
          .eq("workspace_id", workspaceId)
          .eq("user_id", userId)
          .maybeSingle();

        if (!prodError && prodRow && prodRow.workspace_id === workspaceId && prodRow.user_id === userId) {
          // CENÁRIO A: EQUIVALÊNCIA CONFIRMADA PELO USUÁRIO -> MATCH VÁLIDO
          if (equivRow.confirmado_por_usuario === true) {
            const fatorNum = Number(equivRow.fator_conversao);
            const fatorValido = Number.isFinite(fatorNum) && fatorNum > 0 ? fatorNum : 1;

            return {
              status: "matched",
              source: "confirmed_equivalence",
              produtoEyemobileUuid: prodRow.id,
              eyemobileId: prodRow.eyemobile_id,
              fatorConversao: fatorValido,
            };
          }

          // CENÁRIO C: EQUIVALÊNCIA NÃO CONFIRMADA (confirmado_por_usuario = false)
          // JAMAIS PRODUZ "matched". Fica guardado como candidato prioritário para sugestão.
          pendingCandidateRow = prodRow as CandidateProductRow;
        }
      }
    }
  }

  // ─── 3. BUSCA DE SUGESTÕES (NUNCA RETORNA "matched") ───────────
  if (temDescricao || pendingCandidateRow) {
    const suggestions = await findProductSuggestions(
      workspaceId,
      userId,
      input.descricao,
      pendingCandidateRow,
      client
    );

    if (suggestions.length > 0) {
      return {
        status: "suggestion",
        suggestions,
      };
    }
  }

  // ─── 4. NÃO ENCONTRADO ─────────────────────────────────────────
  return { status: "not_found" };
}
