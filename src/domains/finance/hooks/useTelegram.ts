import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/core/logging/LoggerService";

export interface UsuarioTelegram {
  id: string;
  user_id: string;
  telegram_chat_id: string;
  telegram_username?: string | null;
  ativo: boolean;
  created_at?: string;
}

const TELEGRAM_QUERY_KEY = ["usuarios-telegram"] as const;

export const useTelegram = () => {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: vinculo = null, isLoading: loading } = useQuery({
    queryKey: TELEGRAM_QUERY_KEY,
    queryFn: async (): Promise<UsuarioTelegram | null> => {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) return null;
      const { data, error } = await supabase
        .from("usuarios_telegram")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return (data as UsuarioTelegram) ?? null;
    },
    staleTime: 1000 * 60 * 2,
  });

  // Vincula a conta usando o token gerado pelo /start do bot no Telegram
  const vincularConta = useMutation({
    mutationFn: async (token: string) => {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error("Usuário não autenticado");
      const { data, error } = await supabase.functions.invoke("telegram-webhook", {
        body: { action: "vincular", token, user_id: userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TELEGRAM_QUERY_KEY });
      toast({ title: "Telegram vinculado! ✅", description: "Você receberá alertas direto no Telegram." });
    },
    onError: (error) => {
      logger.error("useTelegram", "Erro ao vincular Telegram", { error: String(error) });
      toast({ title: "Erro ao vincular", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    },
  });

  const desvincularConta = useMutation({
    mutationFn: async () => {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error("Usuário não autenticado");
      const { error } = await supabase.from("usuarios_telegram").delete().eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TELEGRAM_QUERY_KEY });
      toast({ title: "Telegram desvinculado", description: "Você não receberá mais mensagens do bot." });
    },
    onError: (error) => {
      logger.error("useTelegram", "Erro ao desvincular Telegram", { error: String(error) });
      toast({ title: "Erro ao desvincular", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    },
  });

  const testarMensagem = useMutation({
    mutationFn: async () => {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error("Usuário não autenticado");
      const { data, error } = await supabase.functions.invoke("enviar-telegram", {
        body: {
          user_id: userId,
          mensagem: "🔔 <b>Teste Wallet</b>\n\nSe você recebeu esta mensagem, seu Telegram está conectado com sucesso!",
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast({ title: "Mensagem enviada", description: "Verifique seu Telegram!" });
    },
    onError: (error) => {
      toast({ title: "Falha no envio", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    },
  });

  return {
    vinculo,
    isVinculado: !!vinculo?.ativo,
    loading,
    vincularConta: (token: string) => vincularConta.mutateAsync(token),
    desvincularConta: () => desvincularConta.mutateAsync(),
    testarMensagem: () => testarMensagem.mutateAsync(),
  };
};
