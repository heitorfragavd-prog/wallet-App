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
