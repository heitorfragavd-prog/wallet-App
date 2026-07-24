import React, { useState, useEffect } from "react";
import { PluggyConnect } from "react-pluggy-connect";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/shared/hooks/use-toast";
import { syncPluggyItemToSupabase } from "@/domains/finance/services/pluggyService";
import { CONTAS_QUERY_KEY } from "@/domains/finance/hooks/useContasUsuario";

interface PluggyConnectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialConnectorId?: number;
  openWidgetDirectly?: boolean;
}

export const PluggyConnectModal: React.FC<PluggyConnectModalProps> = ({
  open,
  onOpenChange,
  initialConnectorId,
}) => {
  const [connectToken, setConnectToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      setLoading(true);
      setError(null);
      setConnectToken(null);

      fetch("/api/pluggy/connect-token", { method: "POST" })
        .then((res) => res.json())
        .then((data) => {
          if (data.accessToken) {
            setConnectToken(data.accessToken);
          } else {
            setError(data.error || "Erro ao conectar com a Pluggy.");
          }
        })
        .catch(() => setError("Erro na requisição da API local."))
        .finally(() => setLoading(false));
    } else {
      setConnectToken(null);
      setError(null);
      setLoading(false);
    }
  }, [open]);

  if (!open) return null;

  const handleClose = () => {
    setConnectToken(null);
    setError(null);
    onOpenChange(false);
  };

  const handleSuccess = async (data: { item: any }) => {
    console.log("Pluggy Connection Success:", data);
    const item = data?.item;
    if (item?.id) {
      toast({
        title: "Sincronizando Open Finance...",
        description: "Buscando saldos e transações do banco conectado...",
      });
      try {
        const result = await syncPluggyItemToSupabase(item.id, item.connector?.name);
        toast({
          title: "Sincronização Concluída!",
          description: `${result.accountsCount} conta(s), ${result.transactionsCount} transação(ões) e ${result.investmentsCount} investimento(s) importados com sucesso.`,
        });
        queryClient.invalidateQueries({ queryKey: CONTAS_QUERY_KEY });
      } catch (err: any) {
        toast({
          title: "Aviso na Importação",
          description: "Banco conectado, mas falhou a sincronização automática dos dados.",
          variant: "destructive",
        });
      }
    }
    handleClose();
  };

  const handleError = (err: { message: string }) => {
    console.error("Pluggy Connection Error:", err);
  };

  return (
    <>
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="bg-[#0B132B] border border-[#1E2942] rounded-2xl p-8 text-center text-slate-300 flex flex-col items-center justify-center space-y-3">
            <span className="animate-spin text-3xl">⏳</span>
            <p className="font-semibold text-sm">Carregando Open Finance...</p>
          </div>
        </div>
      )}

      {error && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="bg-[#0B132B] border border-[#1E2942] rounded-2xl p-8 text-center text-red-400 flex flex-col items-center justify-center space-y-4 max-w-md">
            <span className="text-4xl">⚠️</span>
            <p className="text-sm font-medium">{error}</p>
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition-all"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {!loading && !error && connectToken && (
        <PluggyConnect
          connectToken={connectToken}
          includeSandbox={true}
          selectedConnectorId={initialConnectorId}
          theme="dark"
          onSuccess={handleSuccess}
          onError={handleError}
          onClose={handleClose}
        />
      )}
    </>
  );
};
