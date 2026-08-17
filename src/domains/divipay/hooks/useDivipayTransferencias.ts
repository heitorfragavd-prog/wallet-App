import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { divipayService } from "@/domains/divipay/services/DivipayService";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/core/logging/LoggerService";
import type { CreateWithdrawParams, DivipayTransacao } from "@/domains/divipay/types";

export const DIVIPAY_TRANSFERENCIAS_QUERY_KEY = ["divipay-transferencias"] as const;

async function fetchTransferencias(): Promise<DivipayTransacao[]> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) throw new Error("Usuário não autenticado");

  // Busca do banco local (saques criados pelo próprio Wallet)
  const { data: localData } = await supabase
    .from("divipay_transacoes")
    .select("*")
    .eq("user_id", userId)
    .eq("type", "CASH_OUT")
    .order("created_at", { ascending: false });

  // Busca TODOS os saques/pagamentos da API Divipay (endpoint /api/withdraws).
  // Inclui Pix (DICT) e pagamentos de boleto (BILLET) — inclusive os feitos
  // direto no painel Divipay. Obs.: /api/movements só tem entradas e o filtro
  // type=CASH_OUT retorna HTTP 400, por isso usamos listWithdraws.
  try {
    const allWithdraws: import("@/domains/divipay/types").DivipaySaque[] = [];
    const PAGE = 100;
    const MAX_PAGES = 50; // até 5.000 saques — cobre o histórico completo para o backfill de despesas
    const seenIds = new Set<string>();
    for (let page = 0; page < MAX_PAGES; page++) {
      const { items } = await divipayService.listWithdraws({ limit: PAGE, offset: page * PAGE });
      // A API da Divipay nem sempre devolve a flag hasMore — sem ela o loop
      // parava na 1ª página (foi por isso que só vieram 100 saques e o
      // histórico de 2025 + jan–mai/2026 ficou de fora). Agora continuamos
      // enquanto a página vier cheia e com IDs novos.
      const fresh = items.filter((w) => w.id && !seenIds.has(w.id));
      fresh.forEach((w) => seenIds.add(w.id));
      allWithdraws.push(...fresh);
      if (items.length < PAGE) break; // página incompleta = fim do histórico
      if (fresh.length === 0) break;  // página repetida = API não pagina por offset
    }

    if (allWithdraws.length > 0) {
      const apiAsTransacoes: DivipayTransacao[] = allWithdraws.map((w) => ({
        id: `api-${w.id}`,
        user_id: userId,
        external_id: w.id,
        type: "CASH_OUT",
        status: String(w.status || "").toUpperCase(),
        amount: Number(w.amount || 0),
        fee: Number(w.tax || 0),
        description: w.description || (w.type === "BILLET" ? "Pagamento de boleto" : "Saque Pix"),
        recipient_key: w.document || null,
        created_at: w.createdAt || new Date().toISOString(),
        updated_at: w.createdAt || new Date().toISOString(),
        pix_copy_paste: null,
        pix_qr_code: null,
        metadata: {
          payerName: w.name,
          document: w.document,
          tax: w.tax,
          lote: w.lote,
          paymentType: w.type, // "DICT" (Pix) ou "BILLET" (Boleto)
        },
      }));

      // Combina os resultados sem duplicatas
      const existingIds = new Set((localData ?? []).map((t) => t.external_id || t.id));
      const newFromApi = apiAsTransacoes.filter((t) => !existingIds.has(t.external_id ?? t.id));
      return [...(localData ?? []), ...newFromApi].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }
  } catch (err) {
    logger.error("useDivipayTransferencias", "Erro ao buscar saques da API Divipay", { error: String(err) });
  }

  return localData ?? [];
}


export function useDivipayTransferencias() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: transferencias = [], isLoading: loading } = useQuery({
    queryKey: DIVIPAY_TRANSFERENCIAS_QUERY_KEY,
    queryFn: fetchTransferencias,
    staleTime: 1000 * 60,
  });

  const validateKey = useMutation({
    mutationFn: async (key: string) => {
      logger.info("useDivipayTransferencias", "Validando chave Pix");
      return divipayService.validatePixKey(key);
    },
    onError: (error: Error) => {
      logger.error("useDivipayTransferencias", "Erro ao validar chave Pix", { error: error.message });
    },
  });

  const createTransferencia = useMutation({
    mutationFn: async (params: CreateWithdrawParams) => {
      const { transacao } = await divipayService.createWithdraw(params);
      return transacao;
    },
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: DIVIPAY_TRANSFERENCIAS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["divipay-dashboard"] });
      const msg = variables.type === "BILLET" ? "Pagamento de boleto agendado/criado." : "Saque Pix criado com sucesso.";
      toast({ title: "Transferência criada", description: msg });
    },
    onError: (error: Error) => {
      logger.error("useDivipayTransferencias", "Erro ao criar transferência", { error: error.message });
      toast({
        title: "Erro ao criar transferência",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    transferencias,
    loading,
    validateKey: (key: string) => validateKey.mutateAsync(key),
    validatedKey: validateKey.data ?? null,
    isValidatingKey: validateKey.isPending,
    createTransferencia: (params: CreateWithdrawParams) => createTransferencia.mutateAsync(params),
    isCreating: createTransferencia.isPending,
    resetValidation: () => validateKey.reset(),
    refetch: () => qc.invalidateQueries({ queryKey: DIVIPAY_TRANSFERENCIAS_QUERY_KEY }),
  };
}
