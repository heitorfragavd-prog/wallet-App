import React, { useState, useEffect } from "react";

interface PluggyConnectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialConnectorId?: number;
  openWidgetDirectly?: boolean;
}

export const PluggyConnectModal: React.FC<PluggyConnectModalProps> = ({
  open,
  onOpenChange,
}) => {
  const [connectToken, setConnectToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="bg-[#0B132B] border border-[#1E2942] rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl relative p-2 min-h-[650px] flex flex-col justify-center">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white z-10 text-xl font-bold bg-slate-800/60 hover:bg-slate-700 w-8 h-8 rounded-full flex items-center justify-center transition-all"
        >
          ✕
        </button>

        {loading && (
          <div className="p-16 text-center text-slate-300 flex flex-col items-center justify-center space-y-3 min-h-[500px]">
            <span className="animate-spin text-3xl">⏳</span>
            <p className="font-semibold text-sm">Carregando Open Finance...</p>
          </div>
        )}

        {error && (
          <div className="p-8 text-center text-red-400 flex flex-col items-center justify-center space-y-4">
            <span className="text-4xl">⚠️</span>
            <p className="text-sm font-medium">{error}</p>
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition-all"
            >
              Fechar
            </button>
          </div>
        )}

        {!loading && !error && connectToken && connectToken.length > 20 ? (
          <iframe
            key={connectToken}
            src={`https://connect.pluggy.ai/?connectToken=${connectToken}`}
            className="w-full h-[650px] border-0 rounded-xl"
            allow="payment"
            title="Pluggy Connect Widget"
          />
        ) : null}
      </div>
    </div>
  );
};
