import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { divipayService } from "@/domains/divipay/services/DivipayService";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/core/logging/LoggerService";

export interface ContaUsuario {
  id: string;
  user_id: string;
  nome: string;
  tipo: "conta_corrente" | "poupanca" | "carteira" | "cartao_credito" | "outro";
  saldo_inicial?: number;
  saldo_atual?: number;
  limite_credito?: number;
  dia_fechamento?: number;
  dia_vencimento?: number;
  cor?: string;
  created_at: string;
}

export const CONTAS_QUERY_KEY = ["contas_usuario"] as const;

async function fetchContas(): Promise<ContaUsuario[]> {
  const { data, error } = await supabase
    .from("contas_usuario")
    .select("*")
    .order("nome", { ascending: true });

  if (error) {
    logger.error("useContasUsuario", "Erro ao carregar contas", { error: error.message });
    throw error;
  }

  const contas = (data ?? []) as ContaUsuario[];

  // Conta Divipay: busca o saldo REAL ao vivo da API (getBalance) e
  // persiste no banco para as demais telas. Em caso de falha, mantém o
  // último saldo conhecido do banco.
  const divipayConta = contas.find((c) => c.nome.toLowerCase().includes("divipay"));
  if (divipayConta) {
    try {
      const balances = await divipayService.getBalance();
      const saldoReal = balances.reduce((acc, b) => acc + (Number(b.balance) || 0), 0);
      if (balances.length > 0) {
        divipayConta.saldo_atual = saldoReal;
        // Fire-and-forget: atualiza o banco sem bloquear a tela
        // (tipos gerados do Supabase estão desatualizados: a coluna saldo_atual
        // existe na tabela real, verificado via information_schema)
        void supabase
          .from("contas_usuario")
          .update({ saldo_atual: saldoReal } as never)
          .eq("id", divipayConta.id)
          .then(({ error: updErr }) => {
            if (updErr) logger.error("useContasUsuario", "Falha ao persistir saldo Divipay", { error: updErr.message });
          });
      }
    } catch (err) {
      logger.error("useContasUsuario", "Não foi possível buscar saldo ao vivo da Divipay", { error: String(err) });
    }
  }

  return contas;
}


export const useContasUsuario = () => {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: contas = [], isLoading: loading } = useQuery({
    queryKey: CONTAS_QUERY_KEY,
    queryFn: fetchContas,
    staleTime: 1000 * 60 * 2,
  });

  const createConta = useMutation({
    mutationFn: async (conta: Omit<ContaUsuario, "id" | "user_id" | "created_at">) => {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      const { data, error } = await supabase
        .from("contas_usuario")
        .insert([{ ...conta, user_id: userId }])
        .select()
        .single();
      if (error) throw error;
      return data as ContaUsuario;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONTAS_QUERY_KEY });
      toast({ title: "Conta Criada", description: "Conta/Cartão registrado com sucesso!" });
    },
    onError: (error) => {
      logger.error("useContasUsuario", "Erro ao criar conta", { error: String(error) });
      toast({
        title: "Erro ao criar conta",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    },
  });

  const updateConta = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<ContaUsuario> }) => {
      const { data, error } = await supabase
        .from("contas_usuario")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as ContaUsuario;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONTAS_QUERY_KEY });
      toast({ title: "Conta Atualizada", description: "Dados atualizados com sucesso!" });
    },
    onError: (error) => {
      logger.error("useContasUsuario", "Erro ao atualizar conta", { error: String(error) });
      toast({
        title: "Erro ao atualizar conta",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    },
  });

  const deleteConta = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contas_usuario").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONTAS_QUERY_KEY });
      toast({ title: "Conta Removida", description: "Conta removida com sucesso!" });
    },
    onError: (error) => {
      logger.error("useContasUsuario", "Erro ao remover conta", { error: String(error) });
      toast({
        title: "Erro ao remover conta",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    },
  });

  const saldoConsolidado = contas
    .filter((c) => c.tipo !== "cartao_credito")
    .reduce((acc, c) => acc + (Number(c.saldo_atual) || Number(c.saldo_inicial) || 0), 0);

  const cartoesCredito = contas.filter((c) => c.tipo === "cartao_credito");

  return {
    contas,
    loading,
    saldoConsolidado,
    cartoesCredito,
    createConta: (conta: Omit<ContaUsuario, "id" | "user_id" | "created_at">) =>
      createConta.mutateAsync(conta),
    updateConta: (id: string, updates: Partial<ContaUsuario>) =>
      updateConta.mutateAsync({ id, updates }),
    deleteConta: (id: string) => deleteConta.mutateAsync(id),
  };
};
