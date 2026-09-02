import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/core/logging/LoggerService";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Despesa as DespesaType, PaymentMethod } from "../types";

export interface Despesa extends Omit<DespesaType, "tags" | "anexos"> {
  updated_at?: string;
  workspace_id?: string;
  subcategoria_id?: string | null;
  centro_custo_id?: string | null;
  contato_id?: string | null;
  categorias?: {
    nome: string;
    cor: string;
    icone: string;
  };
  tags?: Array<{ id: string; nome: string; cor?: string }>;
}

export const DESPESAS_QUERY_KEY = ["despesas"] as const;

export interface DespesasQueryParams {
  startDate?: string | null;
  endDate?: string | null;
  workspaceId?: string | null;
}

const DIVIPAY_NON_SETTLED_STATUSES = [
  "PENDING", "PROCESSING", "FAILED", "ERROR", "REJECTED",
  "CANCELED", "CANCELLED", "EXPIRED", "REFUNDED", "CHARGEBACK",
];

async function fetchDivipayDespesas(startDate?: string | null, endDate?: string | null, workspaceId?: string | null): Promise<Despesa[]> {
  try {
    const { divipayService } = await import("@/domains/divipay/services/DivipayService");
    const { resolveBeneficiary } = await import("@/domains/divipay/utils");
    const PAGE = 100;
    const MAX_PAGES = 50;
    const allWithdraws: import("@/domains/divipay/types").DivipaySaque[] = [];
    const seenIds = new Set<string>();

    for (let page = 0; page < MAX_PAGES; page++) {
      const { items } = await divipayService.listWithdraws({ limit: PAGE, offset: page * PAGE });
      const fresh = (items || []).filter((w) => w.id && !seenIds.has(w.id));
      fresh.forEach((w) => seenIds.add(w.id));
      allWithdraws.push(...fresh);
      if (!items || items.length < PAGE) break;
      if (fresh.length === 0) break;
    }

    const startDay = startDate ? startDate.split("T")[0] : null;
    const endDay = endDate ? endDate.split("T")[0] : null;

    return allWithdraws
      .filter((w) => {
        const status = String(w.status || "").toUpperCase();
        if (status && DIVIPAY_NON_SETTLED_STATUSES.some((s) => status.includes(s))) return false;
        const dateStr = (w.createdAt || "").split("T")[0];
        if (startDay && dateStr < startDay) return false;
        if (endDay && dateStr > endDay) return false;
        return true;
      })
      .map((w) => {
        const isBoleto = w.type === "BILLET" || String(w.description || "").toLowerCase().includes("boleto");
        const resolved = resolveBeneficiary(Number(w.amount || 0), w.description || "", isBoleto ? "Boleto" : "Pix");
        const dateVal = w.createdAt ? w.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10);
        const desc = w.description || (isBoleto ? "Pagamento de boleto" : "Saque Pix");
        const fav = w.name || resolved.name || "Divipay";

        return {
          id: `divipay-${w.id}`,
          workspace_id: workspaceId || "",
          user_id: "",
          tipo: "variavel",
          valor: Number(w.amount || 0),
          descricao: desc.includes(fav) ? desc : `${desc} - ${fav}`,
          data: dateVal,
          created_at: w.createdAt || new Date().toISOString(),
          updated_at: w.createdAt || new Date().toISOString(),
          metodo_pagamento: (isBoleto ? "boleto" : "pix") as PaymentMethod,
          observacoes: `Pago via Divipay (${isBoleto ? "boleto" : "Pix"}) - ${w.id}`,
          status: "pago",
          categorias: {
            nome: "Transferências e Saques Divipay",
            cor: "#f97316",
            icone: "ArrowUpRight",
          },
          tags: [],
        } as Despesa;
      });
  } catch (err) {
    logger.warn("useDespesas", "Não foi possível carregar saques direto da Divipay", { error: String(err) });
    return [];
  }
}

// ─── Fetcher puro (sem React) ───────────────────────────────────────────
async function fetchDespesas(params: DespesasQueryParams = {}): Promise<Despesa[]> {
  const { startDate, endDate, workspaceId } = params;
  if (!workspaceId) return [];

  let despesasQuery: any = supabase
    .from("despesas")
    .select("*, categorias!despesas_categoria_id_fkey(nome, cor, icone), despesa_tags (tags (id, nome, cor))")
    .eq("workspace_id", workspaceId);

  if (startDate) despesasQuery = despesasQuery.gte("data", startDate);
  if (endDate) despesasQuery = despesasQuery.lte("data", endDate);

  let transacoesQuery: any = supabase
    .from("transacoes")
    .select("*, categorias(nome, cor, icone)")
    .eq("tipo", "despesa")
    .eq("workspace_id", workspaceId);

  if (startDate) transacoesQuery = transacoesQuery.gte("data", startDate);
  if (endDate) transacoesQuery = transacoesQuery.lte("data", endDate);

  try {
    const [despesasResp, transacoesResp, divipayDespesas] = await Promise.all([
      despesasQuery,
      transacoesQuery,
      fetchDivipayDespesas(startDate, endDate, workspaceId),
    ]);

    // Normaliza despesas: garante que categorias seja objeto
    const mappedDespesas = (despesasResp?.data ?? []).map((d: any) => {
      const cat = d.categorias;
      return {
        ...d,
        tags: d.despesa_tags?.map((dt: any) => dt.tags).filter(Boolean) ?? [],
        categorias: Array.isArray(cat) ? (cat[0] ?? null) : cat,
      };
    });

    // Normaliza transacoes: garante que categorias seja objeto
    const mappedTransacoes = (transacoesResp?.data ?? []).map((d: any) => {
      const cat = d.categorias;
      return {
        ...d,
        categorias: Array.isArray(cat) ? (cat[0] ?? null) : cat,
      };
    });

    // Anti-duplicidade: saques da Divipay que já foram gravados na tabela `despesas`
    // (com marcador divipay-saque:... ou observacoes referenciando o ID)
    const existingDivipayIds = new Set<string>();
    mappedDespesas.forEach((d: any) => {
      const obs = String(d.observacoes || "");
      if (obs.includes("divipay-saque:")) {
        const id = obs.split("divipay-saque:")[1]?.split(")")[0]?.trim();
        if (id) existingDivipayIds.add(id);
      }
      if (obs.includes("Pago via Divipay") && obs.includes(" - ")) {
        const id = obs.split(" - ").pop()?.trim();
        if (id) existingDivipayIds.add(id);
      }
    });

    const filteredDivipay = divipayDespesas.filter((d) => {
      const externalId = d.id.replace("divipay-", "");
      return !existingDivipayIds.has(externalId);
    });

    const res = [...mappedDespesas, ...mappedTransacoes, ...filteredDivipay].sort(
      (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()
    ) as Despesa[];

    return res;
  } catch (err: unknown) {
    console.error("[fetchDespesas Hook Exception]", err);
    throw err;
  }
}




// ─── Tag helpers ─────────────────────────────────────────────────
async function addTagsToDespesa(despesaId: string, tagNames: string[]) {
  const { data: tags, error: tagsError } = await supabase
    .from("tags")
    .select("id, nome")
    .in("nome", tagNames);
  if (tagsError) throw tagsError;

  const { error } = await supabase.from("despesa_tags").insert(
    tags.map((tag) => ({ despesa_id: despesaId, tag_id: tag.id }))
  );
  if (error) throw error;
}

async function updateDespesaTags(despesaId: string, tagNames: string[]) {
  await supabase.from("despesa_tags").delete().eq("despesa_id", despesaId);
  if (tagNames.length > 0) await addTagsToDespesa(despesaId, tagNames);
}

// ─── Hook ─────────────────────────────────────────────────────
export const useDespesas = (params: DespesasQueryParams = {}) => {
  if (typeof window !== "undefined") {
    (window as any).supabase = supabase;
  }
  const qc = useQueryClient();
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const currentWorkspaceId = activeWorkspace?.id || null;
  const { startDate = null, endDate = null } = params;

  // ── Query — queryKey inclui datas e workspaceId
  const { data: despesas = [], isLoading: loading } = useQuery({
    queryKey: [...DESPESAS_QUERY_KEY, { startDate, endDate, workspaceId: currentWorkspaceId }],
    queryFn: () => fetchDespesas({ startDate, endDate, workspaceId: currentWorkspaceId }),
    enabled: !!currentWorkspaceId,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  // ── Mutations
  const createDespesa = useMutation({
    mutationFn: async ({
      despesa,
      tagNames,
    }: {
      despesa: Omit<Despesa, "id" | "user_id" | "created_at" | "updated_at" | "categorias">;
      tagNames?: string[];
    }) => {
      if (!currentWorkspaceId) {
        throw new Error("Workspace não selecionado para criar despesa.");
      }
      const userId = (await supabase.auth.getUser()).data.user?.id;
      let faturaIdToLink = (despesa as any).fatura_id || null;

      // Se for cartão de crédito e fatura_id não veio preenchido, calcula automaticamente por período de fechamento
      if (!faturaIdToLink && despesa.conta_id) {
        try {
          const { data: contaObj } = await supabase
            .from("contas_usuario")
            .select("id, tipo, dia_fechamento, dia_vencimento")
            .eq("id", despesa.conta_id)
            .eq("workspace_id", currentWorkspaceId)
            .maybeSingle();

          if (contaObj && contaObj.tipo === "cartao_credito") {
            const { determinarFaturaParaData, calcularPeriodoFatura } = await import("./useFaturasCartao");
            const { mes_fatura, ano_fatura } = determinarFaturaParaData(despesa.data, contaObj.dia_fechamento);

            const { data: faturaExistente } = await supabase
              .from("faturas_cartao")
              .select("id")
              .eq("cartao_id", contaObj.id)
              .eq("workspace_id", currentWorkspaceId)
              .eq("mes_fatura", mes_fatura)
              .eq("ano_fatura", ano_fatura)
              .maybeSingle();

            if (faturaExistente) {
              faturaIdToLink = faturaExistente.id;
            } else {
              const periodo = calcularPeriodoFatura(contaObj, mes_fatura, ano_fatura);
              const { data: novaFatura } = await supabase
                .from("faturas_cartao")
                .insert({
                  user_id: userId,
                  workspace_id: currentWorkspaceId,
                  cartao_id: contaObj.id,
                  mes_fatura,
                  ano_fatura,
                  data_inicio: periodo.data_inicio,
                  data_fechamento: periodo.data_fechamento,
                  data_vencimento: periodo.data_vencimento,
                  valor_total: 0,
                  status: "aberta",
                })
                .select("id")
                .maybeSingle();

              if (novaFatura) faturaIdToLink = novaFatura.id;
            }
          }
        } catch (e) {
          logger.warn("useDespesas", "Aviso ao calcular fatura automática:", String(e));
        }
      }

      const { data, error } = await supabase
        .from("despesas")
        .insert([{ ...despesa, fatura_id: faturaIdToLink, user_id: userId, workspace_id: currentWorkspaceId }])
        .select("*, categorias!categoria_id (nome, cor, icone)")
        .single();
      if (error) throw error;
      if (tagNames?.length) await addTagsToDespesa(data.id, tagNames);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DESPESAS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["transacoes"] });
      qc.invalidateQueries({ queryKey: ["faturas_cartao"] });
      qc.invalidateQueries({ queryKey: ["fatura-cartao-detalhe"] });
      toast({ title: "Despesa criada", description: "Despesa criada com sucesso!" });
    },
    onError: (error) => {
      logger.error("useDespesas", "Erro ao criar despesa", { error: String(error) });
      toast({ title: "Erro ao criar despesa", description: error instanceof Error ? error.message : (typeof error === 'object' && error !== null && 'message' in error ? String((error as Record<string, unknown>).message) : String(error)), variant: "destructive" });
    },
  });

  const updateDespesa = useMutation({
    mutationFn: async ({
      id,
      updates,
      tagNames,
    }: {
      id: string;
      updates: Partial<Despesa>;
      tagNames?: string[];
    }) => {
      let q = supabase
        .from("despesas")
        .update(updates)
        .eq("id", id);
      if (currentWorkspaceId) {
        q = q.eq("workspace_id", currentWorkspaceId);
      }
      const { data, error } = await q
        .select("*, categorias!categoria_id (nome, cor, icone)")
        .single();
      if (error) throw error;
      if (tagNames !== undefined) await updateDespesaTags(id, tagNames);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DESPESAS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["transacoes"] });
      qc.invalidateQueries({ queryKey: ["faturas_cartao"] });
      qc.invalidateQueries({ queryKey: ["fatura-cartao-detalhe"] });
      toast({ title: "Despesa atualizada", description: "Despesa atualizada com sucesso!" });
    },
    onError: (error) => {
      logger.error("useDespesas", "Erro ao atualizar despesa", { error: String(error) });
      toast({ title: "Erro ao atualizar despesa", description: error instanceof Error ? error.message : (typeof error === 'object' && error !== null && 'message' in error ? String((error as Record<string, unknown>).message) : String(error)), variant: "destructive" });
    },
  });

  const deleteDespesa = useMutation({
    mutationFn: async (id: string) => {
      let q = supabase.from("despesas").delete().eq("id", id);
      if (currentWorkspaceId) {
        q = q.eq("workspace_id", currentWorkspaceId);
      }
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DESPESAS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["transacoes"] });
      qc.invalidateQueries({ queryKey: ["faturas_cartao"] });
      qc.invalidateQueries({ queryKey: ["fatura-cartao-detalhe"] });
      toast({ title: "Despesa removida", description: "Despesa removida com sucesso!" });
    },
    onError: (error) => {
      logger.error("useDespesas", "Erro ao remover despesa", { error: String(error) });
      toast({ title: "Erro ao remover despesa", description: error instanceof Error ? error.message : (typeof error === 'object' && error !== null && 'message' in error ? String((error as Record<string, unknown>).message) : String(error)), variant: "destructive" });
    },
  });

  // ── Filtros e utilitários (derivações puras do cache)
  const filterByPaymentMethod = (paymentMethod: PaymentMethod | null) => {
    if (paymentMethod === null) return despesas.filter((d) => !d.metodo_pagamento);
    return despesas.filter((d) => d.metodo_pagamento === paymentMethod);
  };

  const filterByAccount = (accountId: string) =>
    despesas.filter((d) => d.conta_id === accountId);

  const filterByTags = (tagNames: string[]) => {
    if (!tagNames.length) return despesas;
    return despesas.filter((d) =>
      tagNames.every((name) => d.tags?.some((t) => t.nome === name))
    );
  };

  const searchDespesas = (searchTerm: string) => {
    if (!searchTerm.trim()) return despesas;
    const term = searchTerm.toLowerCase();
    return despesas.filter(
      (d) =>
        d.descricao.toLowerCase().includes(term) ||
        d.categorias?.nome.toLowerCase().includes(term) ||
        (d.observacoes && d.observacoes.toLowerCase().includes(term))
    );
  };

  const getDespesaTags = async (despesaId: string): Promise<string[]> => {
    try {
      const { data, error } = await supabase
        .from("despesa_tags")
        .select("tags (nome)")
        .eq("despesa_id", despesaId);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return data.map((item: any) => item.tags?.nome).filter(Boolean);
    } catch (error) {
      logger.error("useDespesas", "Erro ao buscar tags da despesa", { error: String(error) });
      return [];
    }
  };

  return {
    despesas,
    loading,
    createDespesa: (
      despesa: Omit<Despesa, "id" | "user_id" | "created_at" | "updated_at" | "categorias">,
      tagNames?: string[]
    ) => createDespesa.mutateAsync({ despesa, tagNames }),
    updateDespesa: (id: string, updates: Partial<Despesa>, tagNames?: string[]) =>
      updateDespesa.mutateAsync({ id, updates, tagNames }),
    deleteDespesa: (id: string) => deleteDespesa.mutateAsync(id),
    refetch: () => qc.invalidateQueries({ queryKey: DESPESAS_QUERY_KEY }),
    filterByPaymentMethod,
    filterByAccount,
    filterByTags,
    searchDespesas,
    getDespesaTags,
  };
};