import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { divipayService } from "@/domains/divipay/services/DivipayService";
import type { DivipayMovement } from "@/domains/divipay/types";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/core/logging/LoggerService";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Receita as ReceitaType, PaymentMethod } from "../types";


export interface Receita extends Omit<ReceitaType, "tags" | "anexos"> {
  updated_at?: string;
  categorias?: {
    nome: string;
    cor: string;
    icone: string;
  };
  tags?: Array<{ id: string; nome: string; cor?: string }>;
}

export const RECEITAS_QUERY_KEY = ["receitas"] as const;

export interface ReceitasQueryParams {
  startDate?: string | null;
  endDate?: string | null;
}

// O PostgREST/Supabase devolve NO MÁXIMO 1000 linhas por requisição
// (max-rows do servidor), mesmo pedindo .limit(15000). Sem paginação,
// meses com +1000 vendas vinham cortados numa fatia aleatória — foi isso
// que derrubou o dinheiro do PDV (R$ 19,1 mil viravam ~R$ 2,5 mil).
// Aqui paginamos de 1000 em 1000 com ORDER BY determinístico.
const POSTGREST_PAGE_SIZE = 1000;

async function fetchAllRows<T>(
  buildQuery: () => ReturnType<typeof supabase.from>,
  applyFilters: (q: any) => any,
  columns: string,
  maxRows: number = 2000
): Promise<T[]> {
  const all: T[] = [];
  try {
    for (let offset = 0; offset < maxRows; offset += POSTGREST_PAGE_SIZE) {
      const { data, error } = await applyFilters(buildQuery().select(columns))
        .order("data", { ascending: false })
        .range(offset, offset + POSTGREST_PAGE_SIZE - 1);
      if (error) {
        console.warn("Error fetching rows:", error.message);
        break; // devolve o que já conseguiu em vez de zerar o mês inteiro
      }
      const rows = (data as T[]) ?? [];
      all.push(...rows);
      if (rows.length < POSTGREST_PAGE_SIZE) break; // última página
    }
  } catch (err) {
    console.warn("Exception fetching rows:", err);
  }
  return all;
}


// ─── Fetcher puro ─────────────────────────────────────────────────
// Regra de Consolidação — fonte da verdade por meio de pagamento:
// 1. DINHEIRO (espécie): Eyemobile PDV — valor registrado no caixa, sem taxa.
// 2. PIX / CRÉDITO / DÉBITO / BOLETO: Divipay — valor LÍQUIDO (amountLiquid),
//    ou seja, o valor real que cai na conta depois das taxas da maquininha.
//    Somente movimentos liquidados/confirmados contam como receita.
// 3. Receitas manuais: tabela `receitas`.
// 4. Pluggy (Open Finance): entradas das contas conectadas entram normalmente —
//    a conta de liquidação da Divipay NÃO é conectada, então não há duplicidade.
// Anti-duplicidade:
// - Vendas PDV pagas em Pix/Cartão NÃO entram pela Eyemobile (já entram pela Divipay).

// Status da Divipay que NÃO representam dinheiro liquidado na conta
const DIVIPAY_NON_SETTLED_STATUSES = [
  "PENDING", "PROCESSING", "FAILED", "ERROR", "REJECTED",
  "CANCELED", "CANCELLED", "EXPIRED", "REFUNDED", "CHARGEBACK",
];
const DIVIPAY_CASH_OUT_TYPES = ["CASH_OUT", "CASHOUT", "WITHDRAW", "SAQUE", "TRANSFER_OUT"];
const DIVIPAY_PAGE_LIMIT = 1000; // API aceita páginas grandes (validado em produção)
const DIVIPAY_MAX_RANGE_DAYS = 89; // API aceita no máximo 90 dias por consulta
const DIVIPAY_MAX_PAGES_PER_CHUNK = 60; // 60 páginas x 1.000 = até 60.000 movimentos por janela

function normalizeMetodoPagamento(raw: unknown): PaymentMethod {
  const m = String(raw || "").toLowerCase();
  if (m.includes("dinheiro") || m.includes("cash") || m.includes("especie") || m.includes("money")) return "dinheiro";
  if (m.includes("pix")) return "pix";
  if (m.includes("credito") || m.includes("credit")) return "cartao_credito";
  if (m.includes("debito") || m.includes("debit")) return "cartao_debito";
  if (m.includes("boleto") || m.includes("ticket")) return "boleto";
  if (m.includes("voucher") || m.includes("vale")) return "voucher";
  if (m.includes("transfer")) return "transferencia";
  return "outros" as PaymentMethod;
}

function isEyemobilePDVTransaction(t: { descricao?: string | null; observacoes?: string | null }): boolean {
  const desc = (t.descricao || "").toLowerCase();
  const obs = (t.observacoes || "").toLowerCase();
  return (
    obs.includes("integrado via eyemobile api") || // marcador oficial gravado pelo eyemobile-sync
    desc.startsWith("venda eyemobile") ||
    desc.includes("eyemobile") ||
    obs.includes("eyemobile") ||
    desc.includes("pdv")
  );
}

// Busca TODAS as entradas digitais liquidadas da Divipay (com paginação),
// usando o valor líquido — o que realmente cai na conta após as taxas.
async function fetchDivipayReceitas(startDate?: string | null, endDate?: string | null, workspaceId?: string | null): Promise<Receita[]> {
  const startDay = startDate ? startDate.split("T")[0] : `${new Date().getFullYear()}-01-01`;
  const endDay = endDate ? endDate.split("T")[0] : new Date().toISOString().split("T")[0];

  // A API Divipay aceita no máximo 90 dias por consulta (validado em produção:
  // acima disso retorna HTTP 400). Dividimos o período em janelas de 89 dias.
  const chunks: Array<{ initial: string; final: string }> = [];
  let chunkStart = new Date(`${startDay}T00:00:00`);
  const lastDay = new Date(`${endDay}T00:00:00`);
  while (chunkStart <= lastDay) {
    const chunkEnd = new Date(chunkStart);
    chunkEnd.setDate(chunkEnd.getDate() + DIVIPAY_MAX_RANGE_DAYS - 1);
    const effectiveEnd = chunkEnd > lastDay ? lastDay : chunkEnd;
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    chunks.push({ initial: `${fmt(chunkStart)}T00:00:00`, final: `${fmt(effectiveEnd)}T23:59:59` });
    chunkStart = new Date(effectiveEnd);
    chunkStart.setDate(chunkStart.getDate() + 1);
  }

  // Pagina cada janela EM PARALELO (YTD = ~39 requisições; em série a tela
  // ficava vazia por quase 1 minuto) e deduplica por ID nas bordas.
  const chunkResults = await Promise.all(
    chunks.map(async (chunk) => {
      const items: DivipayMovement[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < DIVIPAY_MAX_PAGES_PER_CHUNK; page++) {
        const response = await divipayService.listMovements({
          initialDate: chunk.initial,
          finalDate: chunk.final,
          limit: DIVIPAY_PAGE_LIMIT,
          cursor,
        });
        items.push(...(response.items ?? []));
        if (!response.hasMore || !response.nextCursor) break;
        cursor = response.nextCursor;
      }
      return items;
    })
  );

  const movements: DivipayMovement[] = [];
  const seenIds = new Set<string>();
  for (const items of chunkResults) {
    for (const item of items) {
      const key = item.id || item.transactionCode;
      if (key && seenIds.has(key)) continue;
      if (key) seenIds.add(key);
      movements.push(item);
    }
  }

  return movements
    .filter((m) => {
      const typeStr = String(m.type || "").toUpperCase();
      const statusStr = String(m.status || "").toUpperCase();
      // Ignora saques/transferências (saídas, não receita)
      if (DIVIPAY_CASH_OUT_TYPES.some((t) => typeStr.includes(t))) return false;
      // Ignora o que ainda não liquidou (pendente, falhou, cancelado, estornado).
      // Receita = somente o valor real que caiu na conta.
      if (statusStr && DIVIPAY_NON_SETTLED_STATUSES.some((s) => statusStr.includes(s))) return false;
      return true;
    })
    .map((m) => {
      const tp = String(m.type || "").toUpperCase();
      const desc = String(m.description || "").toUpperCase();
      let metodo: PaymentMethod = "pix";
      if (tp.includes("CREDIT") || desc.includes("CREDIT") || desc.includes("CRÉDITO")) metodo = "cartao_credito";
      else if (tp.includes("DEBIT") || desc.includes("DEBIT") || desc.includes("DÉBITO")) metodo = "cartao_debito";
      else if (tp.includes("BOLETO") || tp.includes("TICKET") || desc.includes("BOLETO")) metodo = "boleto";

      return {
        id: `divipay-${m.id}`,
        user_id: "",
        workspace_id: workspaceId || "",
        tipo: "receita",
        // Valor LÍQUIDO: já vem sem as taxas da Divipay — é o que realmente entra na conta
        valor: m.amountLiquid > 0 ? m.amountLiquid : Number(m.amount || 0),
        descricao: m.description || `Entrada Divipay (${m.payerName || "Cliente"})`,
        data: m.date || new Date().toISOString(),
        created_at: m.date || new Date().toISOString(),
        updated_at: m.date || new Date().toISOString(),
        metodo_pagamento: metodo,
        observacoes: `Entrada digital Divipay (líquido) - ID ${m.transactionCode || m.id}`,
        categorias: {
          nome: "Vendas Divipay",
          cor: "#f59e0b",
          icone: "Smartphone",
        },
      } as Receita;
    });
}

async function fetchReceitas(
  params: ReceitasQueryParams = {},
  options: { onDivipayError?: (message: string) => void } = {},
  workspaceId?: string | null
): Promise<Receita[]> {
  const { startDate, endDate } = params;

  const applyFilters = (q: ReturnType<typeof supabase.from>) => {
    let query = q;
    if (startDate) query = query.gte("data", startDate);
    if (endDate) query = query.lte("data", endDate);
    return query;
  };

  // A tabela `receitas` tem DUAS FKs para `categorias` (categoria_id e
  // subcategoria_id) — o embed sem dica (`categorias (...)`) falha com
  // "more than one relationship" e as receitas manuais sumiam em silêncio.
  const RECEITAS_COLS = "id, user_id, valor, descricao, data, created_at, updated_at, categoria_id, conta_id, metodo_pagamento, observacoes, categorias!categoria_id (nome, cor, icone)";
  const TRANSACOES_COLS = "id, user_id, tipo, valor, descricao, data, created_at, updated_at, categoria_id, conta_id, metodo_pagamento, observacoes, categorias!categoria_id (nome, cor, icone)";

  const buildReceitas = () => supabase.from("receitas");
  const buildTransacoes = () => supabase.from("transacoes");

  // Invocação das receitas normais e transações de receitas
  const [receitasResp, transacoesResp] = await Promise.all([
    fetchAllRows<any>(buildReceitas, applyFilters, RECEITAS_COLS, 100000),
    fetchAllRows<any>(buildTransacoes, (q) => applyFilters(q).eq("tipo", "receita"), TRANSACOES_COLS, 100000),
  ]);

  const mappedReceitas = (receitasResp ?? []).map((r) => ({
    ...r,
    tipo: "receita",
    metodo_pagamento: r.metodo_pagamento ? String(r.metodo_pagamento).toLowerCase() : r.metodo_pagamento,
  }));

  // 1. Eyemobile/PDV: aceitar SOMENTE pagamentos em dinheiro (espécie).
  //    Pix/Cartão do PDV entram pela Divipay (valor líquido) — nunca aqui.
  //    Demais transações (manuais, Pluggy/Open Finance) entram normalmente.
  const filteredTransacoes = (transacoesResp ?? []).map((t) => ({
    ...t,
    metodo_pagamento: normalizeMetodoPagamento(t.metodo_pagamento),
  })).filter((t) => {
    if (isEyemobilePDVTransaction(t)) {
      return t.metodo_pagamento === "dinheiro";
    }
    return true;
  });

  // 2. Entradas digitais liquidadas da Divipay (valor líquido, com paginação)
  let divipayReceitas: Receita[] = [];
  try {
    divipayReceitas = await fetchDivipayReceitas(startDate, endDate, workspaceId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("useReceitas", "Não foi possível carregar entradas da Divipay", { error: message });
    // Nunca mais zero silencioso: avisa o usuário que Pix/Cartão não carregaram
    options.onDivipayError?.(message);
  }

  return [...mappedReceitas, ...filteredTransacoes, ...divipayReceitas].sort(
    (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()
  ) as Receita[];
}



// ─── Tag helpers ──────────────────────────────────────────────────
async function addTagsToReceita(receitaId: string, tagNames: string[]) {
  const { data: tags, error: tagsError } = await supabase
    .from("tags")
    .select("id, nome")
    .in("nome", tagNames);
  if (tagsError) throw tagsError;

  const { error } = await supabase.from("receita_tags").insert(
    tags.map((tag) => ({ receita_id: receitaId, tag_id: tag.id }))
  );
  if (error) throw error;
}

async function updateReceitaTags(receitaId: string, tagNames: string[]) {
  await supabase.from("receita_tags").delete().eq("receita_id", receitaId);
  if (tagNames.length > 0) await addTagsToReceita(receitaId, tagNames);
}

// ─── Hook ─────────────────────────────────────────────────────────
export const useReceitas = (params: ReceitasQueryParams = {}) => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const { startDate = null, endDate = null } = params;
  const workspaceId = activeWorkspace?.id ?? null;

  const { data: receitas = [], isLoading: loading } = useQuery({
    queryKey: [...RECEITAS_QUERY_KEY, { startDate, endDate, workspaceId }],
    queryFn: () =>
      fetchReceitas({ startDate, endDate }, {
        onDivipayError: (message) =>
          toast({
            title: "Receitas Divipay não carregadas",
            description: `Pix/Crédito/Débito podem estar zerados. Motivo: ${message}`,
            variant: "destructive",
          }),
      }, workspaceId),
    // Keep results hot in cache for 10 min so re-clicking a date range is instant
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 30,
  });

  const createReceita = useMutation({
    mutationFn: async ({
      receita,
      tagNames,
    }: {
      receita: Omit<Receita, "id" | "user_id" | "created_at" | "updated_at" | "categorias">;
      tagNames?: string[];
    }) => {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      const { data, error } = await supabase
        .from("receitas")
        .insert([{ ...receita, user_id: userId }])
        .select("*, categorias!categoria_id (nome, cor, icone)")
        .single();
      if (error) throw error;
      if (tagNames?.length) await addTagsToReceita(data.id, tagNames);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RECEITAS_QUERY_KEY });
      toast({ title: "Receita criada", description: "Receita criada com sucesso!" });
    },
    onError: (error) => {
      logger.error("useReceitas", "Erro ao criar receita", { error: String(error) });
      toast({ title: "Erro ao criar receita", description: error instanceof Error ? error.message : (typeof error === 'object' && error !== null && 'message' in error ? (error as any).message : String(error)), variant: "destructive" });
    },
  });

  const updateReceita = useMutation({
    mutationFn: async ({
      id,
      updates,
      tagNames,
    }: {
      id: string;
      updates: Partial<Receita>;
      tagNames?: string[];
    }) => {
      const { data, error } = await supabase
        .from("receitas")
        .update(updates)
        .eq("id", id)
        .select("*, categorias!categoria_id (nome, cor, icone)")
        .single();
      if (error) throw error;
      if (tagNames !== undefined) await updateReceitaTags(id, tagNames);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RECEITAS_QUERY_KEY });
      toast({ title: "Receita atualizada", description: "Receita atualizada com sucesso!" });
    },
    onError: (error) => {
      logger.error("useReceitas", "Erro ao atualizar receita", { error: String(error) });
      toast({ title: "Erro ao atualizar receita", description: error instanceof Error ? error.message : (typeof error === 'object' && error !== null && 'message' in error ? (error as any).message : String(error)), variant: "destructive" });
    },
  });

  const deleteReceita = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("receitas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RECEITAS_QUERY_KEY });
      toast({ title: "Receita removida", description: "Receita removida com sucesso!" });
    },
    onError: (error) => {
      logger.error("useReceitas", "Erro ao remover receita", { error: String(error) });
      toast({ title: "Erro ao remover receita", description: error instanceof Error ? error.message : (typeof error === 'object' && error !== null && 'message' in error ? (error as any).message : String(error)), variant: "destructive" });
    },
  });

  // ── Filtros e utilitários
  const filterByPaymentMethod = (paymentMethod: PaymentMethod | null) => {
    if (paymentMethod === null) return receitas.filter((r) => !r.metodo_pagamento);
    return receitas.filter((r) => r.metodo_pagamento === paymentMethod);
  };

  const filterByAccount = (accountId: string) =>
    receitas.filter((r) => r.conta_id === accountId);

  const filterByTags = (tagNames: string[]) => {
    if (!tagNames.length) return receitas;
    return receitas.filter((r) =>
      tagNames.every((name) => r.tags?.some((t) => t.nome === name))
    );
  };

  const searchReceitas = (searchTerm: string) => {
    if (!searchTerm.trim()) return receitas;
    const term = searchTerm.toLowerCase();
    return receitas.filter(
      (r) =>
        r.descricao.toLowerCase().includes(term) ||
        r.categorias?.nome.toLowerCase().includes(term) ||
        (r.observacoes && r.observacoes.toLowerCase().includes(term))
    );
  };

  const getReceitaTags = async (receitaId: string): Promise<string[]> => {
    try {
      const { data, error } = await supabase
        .from("receita_tags")
        .select("tags (nome)")
        .eq("receita_id", receitaId);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return data.map((item: any) => item.tags?.nome).filter(Boolean);
    } catch (error) {
      logger.error("useReceitas", "Erro ao buscar tags da receita", { error: String(error) });
      return [];
    }
  };

  return {
    receitas,
    loading,
    createReceita: (
      receita: Omit<Receita, "id" | "user_id" | "created_at" | "updated_at" | "categorias">,
      tagNames?: string[]
    ) => createReceita.mutateAsync({ receita, tagNames }),
    updateReceita: (id: string, updates: Partial<Receita>, tagNames?: string[]) =>
      updateReceita.mutateAsync({ id, updates, tagNames }),
    deleteReceita: (id: string) => deleteReceita.mutateAsync(id),
    refetch: () => qc.invalidateQueries({ queryKey: RECEITAS_QUERY_KEY }),
    filterByPaymentMethod,
    filterByAccount,
    filterByTags,
    searchReceitas,
    getReceitaTags,
  };
};