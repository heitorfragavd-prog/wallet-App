import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/shared/hooks/use-toast";

export function useCategorizacaoIA() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: { descricao: string; valor: number; tipo: "receita" | "despesa" }) => {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/categorizar-ia`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) throw new Error("Erro na categorizacao");
      return res.json() as Promise<{ categoria: string; confianca: number; justificativa: string }>;
    },
    onError: () => {
      toast({ title: "IA indisponível", description: "Categorize manualmente", variant: "destructive" });
    },
  });
}
