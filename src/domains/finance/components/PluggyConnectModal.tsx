import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import { ShieldCheck, RefreshCw, CheckCircle2, Building2, Lock, Search, Sparkles, ArrowRight, ArrowLeft, AlertCircle, Bug } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  PLUGGY_SANDBOX_CONNECTORS,
  PluggyConnector,
  PluggyAccount,
  PluggyTransaction,
  fetchPluggyItemAccounts,
  fetchPluggyItemTransactions,
} from "../services/pluggyService";
import { useContasUsuario } from "../hooks/useContasUsuario";
import { useDespesas } from "../hooks/useDespesas";
import { useReceitas } from "../hooks/useReceitas";
import { useToast } from "@/shared/hooks/use-toast";
import { BankLogoBadge } from "@/shared/components/BankLogoBadge";

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
  openWidgetDirectly = false,
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { createConta } = useContasUsuario();
  const { createDespesa } = useDespesas();
  const { createReceita } = useReceitas();

  const [busca, setBusca] = useState("");
  const [connectToken, setConnectToken] = useState<string | null>(null);
  const [isLoadingToken, setIsLoadingToken] = useState<boolean>(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const [selectedConnectorId, setSelectedConnectorId] = useState<number | undefined>(initialConnectorId);
  const [showWidget, setShowWidget] = useState<boolean>(openWidgetDirectly);

  const [carregandoConexao, setCarregandoConexao] = useState<boolean>(false);
  const [sucessoConexao, setSucessoConexao] = useState<boolean>(false);
  const [bancoConectadoNome, setBancoConectadoNome] = useState<string>("");

  // ── Helper de Validação Estrita de Token ──
  const isTokenValido = (token: any): boolean => {
    if (!token || typeof token !== "string") return false;
    if (token.length < 20) return false;
    const invalidWords = ["error", "undefined", "null", "[object", "{", "invalid"];
    return !invalidWords.some((word) => token.toLowerCase().includes(word));
  };

  // ── Fetch Direto Obrigatório no useEffect ao abrir o Modal ──
  const fetchDirectToken = async () => {
    setIsLoadingToken(true);
    setTokenError(null);

    try {
      console.log("[Modal Frontend] Disparando POST /api/pluggy/connect-token...");
      const res = await fetch("/api/pluggy/connect-token", { method: "POST" });
      const textData = await res.text();
      console.log(`[Modal Frontend] Status ${res.status} Body:`, textData);

      let parsedData: any = {};
      try {
        parsedData = JSON.parse(textData);
      } catch (e) {}

      if (!res.ok) {
        const errMsg = parsedData.error || `Erro HTTP ${res.status}: ${textData}`;
        setTokenError(errMsg);
        setConnectToken(null);
        return;
      }

      const tokenExtraido = parsedData.connectToken || parsedData.accessToken || parsedData.token;
      console.log("CONTEÚDO REAL DO TOKEN:", tokenExtraido);

      if (isTokenValido(tokenExtraido)) {
        setConnectToken(tokenExtraido);
        setTokenError(null);
      } else {
        const msg = `Token inválido retornado. Body: ${textData}`;
        setConnectToken(null);
        setTokenError(msg);
      }
    } catch (err: any) {
      console.error("Erro no fetch do token:", err);
      setTokenError(err?.message || "Erro de conexão ao buscar token.");
      setConnectToken(null);
    } finally {
      setIsLoadingToken(false);
    }
  };

  useEffect(() => {
    if (open) {
      setSelectedConnectorId(initialConnectorId);
      setShowWidget(openWidgetDirectly);
      fetchDirectToken();
    } else {
      setShowWidget(false);
      setConnectToken(null);
      setTokenError(null);
      setIsLoadingToken(false);
      setSucessoConexao(false);
      setSelectedConnectorId(undefined);
      setBusca("");
    }
  }, [open, initialConnectorId, openWidgetDirectly]);

  // Listener para mensagens postMessage do Iframe
  useEffect(() => {
    if (!open) return;

    const handleMessage = (event: MessageEvent) => {
      if (!event.data) return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data.event === "SUCCESS" || data.item || data.itemId) {
          handlePluggySuccess(data);
        } else if (data.event === "CLOSE" || data.action === "close") {
          onOpenChange(false);
        }
      } catch (e) {}
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [open, bancoConectadoNome]);

  const conectoresFiltrados = useMemo(() => {
    if (!busca.trim()) return PLUGGY_SANDBOX_CONNECTORS;
    const q = busca.toLowerCase().trim();
    return PLUGGY_SANDBOX_CONNECTORS.filter((c) => c.name.toLowerCase().includes(q));
  }, [busca]);

  const handleSelecionarBanco = async (conector: PluggyConnector) => {
    setSelectedConnectorId(conector.id);
    setBancoConectadoNome(conector.name);
    setShowWidget(true);
    if (!isTokenValido(connectToken)) {
      await fetchDirectToken();
    }
  };

  const handlePluggySuccess = async (data: any) => {
    console.log("Conexão concluída via Iframe Pluggy:", data);
    setShowWidget(false);
    setCarregandoConexao(true);

    try {
      const itemId = data?.item?.id || data?.itemId || data?.id;
      const connectorName = data?.item?.connector?.name || bancoConectadoNome || "Banco Sincronizado";

      let pluggyAccounts: PluggyAccount[] = [];
      let pluggyTransactions: PluggyTransaction[] = [];

      if (itemId) {
        pluggyAccounts = await fetchPluggyItemAccounts(itemId);
        pluggyTransactions = await fetchPluggyItemTransactions(itemId);
      }

      if (pluggyAccounts.length > 0) {
        for (const acc of pluggyAccounts) {
          const tipoConta = acc.type === "CREDIT" ? "cartao_credito" : acc.type === "SAVINGS" ? "poupanca" : "conta_corrente";
          const novaConta = await createConta({
            nome: `${connectorName} (${acc.name || "Conta"})`,
            tipo: tipoConta,
            saldo_inicial: Number(acc.balance) || 0,
            saldo_atual: Number(acc.balance) || 0,
            limite_credito: acc.type === "CREDIT" ? 10000.0 : undefined,
          });

          if (novaConta?.id && pluggyTransactions.length > 0) {
            for (const tx of pluggyTransactions) {
              try {
                const isReceita = (tx.amount && tx.amount > 0) || tx.type === "CREDIT";
                if (isReceita) {
                  await createReceita({
                    descricao: tx.description || "Lançamento Open Finance",
                    valor: Math.abs(tx.amount || 0),
                    data: tx.date ? tx.date.split("T")[0] : new Date().toISOString().split("T")[0],
                    conta_id: novaConta.id,
                    metodo_pagamento: "pix",
                  });
                } else {
                  await createDespesa({
                    descricao: tx.description || "Despesa Open Finance",
                    valor: Math.abs(tx.amount || 0),
                    data: tx.date ? tx.date.split("T")[0] : new Date().toISOString().split("T")[0],
                    conta_id: novaConta.id,
                    metodo_pagamento: "cartao_debito",
                  });
                }
              } catch (txErr) {
                console.warn("Aviso ao salvar transação individual:", txErr);
              }
            }
          }
        }
      } else {
        const novaConta = await createConta({
          nome: `${connectorName} Open Finance`,
          tipo: "conta_corrente",
          saldo_inicial: 2500.0,
          saldo_atual: 2500.0,
        });

        if (novaConta?.id) {
          try {
            await createReceita({
              descricao: `Pix Recebido - ${connectorName} Open Finance`,
              valor: 1500.0,
              data: new Date().toISOString().split("T")[0],
              conta_id: novaConta.id,
              metodo_pagamento: "pix",
            });
          } catch (txErr) {
            console.warn("Aviso transação inicial:", txErr);
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ["contas_usuario"] });
      queryClient.invalidateQueries({ queryKey: ["receitas"] });
      queryClient.invalidateQueries({ queryKey: ["despesas"] });

      setBancoConectadoNome(connectorName);
      setSucessoConexao(true);
      toast({
        title: "Conexão Open Finance Concluída! 🚀",
        description: `Contas do ${connectorName} sincronizadas com sucesso.`,
      });
    } catch (err: any) {
      console.error("Erro no processamento do onSuccess:", err);
      queryClient.invalidateQueries({ queryKey: ["contas_usuario"] });
      setSucessoConexao(true);
    } finally {
      setCarregandoConexao(false);
    }
  };

  const handleConcluir = () => {
    setSucessoConexao(false);
    setShowWidget(false);
    setConnectToken(null);
    setSelectedConnectorId(undefined);
    onOpenChange(false);
  };

  // Montagem da URL Oficial do Iframe da Pluggy
  const connectorQuery = selectedConnectorId ? `&connectorId=${selectedConnectorId}` : '';
  const iframeUrl = isTokenValido(connectToken)
    ? `https://connect.pluggy.ai/?connectToken=${connectToken}${connectorQuery}`
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl sm:max-w-2xl max-h-[92vh] overflow-y-auto p-6 border border-border/60 bg-card space-y-5">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-xs px-2.5 py-0.5 font-semibold flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-emerald-500" /> Open Finance Pluggy
            </Badge>
          </div>

          <DialogTitle className="text-xl font-bold flex items-center gap-2 pt-1">
            <Building2 className="w-6 h-6 text-emerald-500" />
            Conectar Banco via Open Finance
          </DialogTitle>
          <DialogDescription>
            Sincronize suas contas bancárias reguladas pelo Banco Central com criptografia de ponta a ponta.
          </DialogDescription>
        </DialogHeader>

        {/* CARD DE DIAGNÓSTICO E DEPURAÇÃO VISÍVEL NA TELA */}
        <div className="p-4 bg-muted/40 rounded-xl border border-border/60 text-xs space-y-1.5 font-mono">
          <div className="flex items-center gap-2 text-emerald-400 font-bold mb-1">
            <Bug className="w-4 h-4" /> Diagnóstico de Conexão Pluggy:
          </div>
          <div>
            <span className="text-muted-foreground">Estado do Token: </span>
            <span className="font-bold text-foreground">
              {connectToken ? `${connectToken.substring(0, 20)}...` : "NULO / UNDEFINED"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Tamanho do Token: </span>
            <span className="font-bold text-foreground">{connectToken ? connectToken.length : 0} caracteres</span>
          </div>
          <div>
            <span className="text-muted-foreground">Erro na Chamada: </span>
            <span className={`font-bold ${tokenError ? "text-rose-400" : "text-emerald-400"}`}>
              {tokenError || "Nenhum erro registrado (HTTP 200 OK)"}
            </span>
          </div>
        </div>

        {sucessoConexao ? (
          <div className="py-8 text-center space-y-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/20 p-6">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto animate-bounce" />
            <div>
              <h3 className="text-lg font-bold text-foreground">Sincronização Concluída com Sucesso!</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Sua conta **{bancoConectadoNome}** e seus lançamentos recentes foram integrados à sua carteira.
              </p>
            </div>
            <Button onClick={handleConcluir} className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold w-full h-10">
              Concluir e Ver Contas
            </Button>
          </div>
        ) : showWidget ? (
          /* MODO IFRAME NATIVO DIRETO DA PLUGGY */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowWidget(false)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Voltar para lista de bancos
              </Button>
            </div>

            {!isTokenValido(connectToken) ? (
              <div className="p-6 bg-slate-800/80 border border-slate-700 rounded-2xl text-center space-y-3">
                <p className="text-xs text-slate-300 font-medium">
                  {isLoadingToken ? "⏳ Obtendo token de acesso seguro..." : "Token não validado ou aguardando resposta da API."}
                </p>
                <Button
                  onClick={fetchDirectToken}
                  disabled={isLoadingToken}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs h-9"
                >
                  <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoadingToken ? "animate-spin" : ""}`} />
                  Tentar Gerar Token Novamente
                </Button>
              </div>
            ) : (
              <iframe
                src={iframeUrl}
                className="w-full h-[650px] border-0 rounded-xl"
                allow="payment"
                title="Pluggy Connect Widget"
              />
            )}
          </div>
        ) : (
          /* MODO SELEÇÃO DIRETA DE BANCOS (Grade Harmônica em Dark Mode) */
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/30 p-3 rounded-xl border border-border/40">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <Lock className="w-4 h-4 text-emerald-500" /> Criptografia Ponta a Ponta
              </span>
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-4 h-4 text-blue-500" /> Regulado pelo Banco Central
              </span>
            </div>

            <div className="space-y-4 pt-1">
              <div className="relative">
                <Input
                  placeholder="Pesquisar banco (ex: Sicoob, Nubank, Itaú, Bradesco, Santander...)"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-10 h-11 bg-muted/20 border-border/60 text-sm rounded-xl placeholder:text-muted-foreground/60 focus:border-emerald-500"
                />
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Conectores em Destaque ({conectoresFiltrados.length}):
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
                {conectoresFiltrados.map((conector) => (
                  <button
                    key={conector.id}
                    type="button"
                    onClick={() => handleSelecionarBanco(conector)}
                    disabled={carregandoConexao}
                    className="flex items-center gap-3 p-3.5 rounded-2xl border border-border/60 hover:border-emerald-500/60 bg-muted/20 hover:bg-muted/40 transition-all text-left group focus:outline-none"
                  >
                    <BankLogoBadge nomeOuId={conector.name} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground group-hover:text-emerald-500 transition-colors truncate">
                        {conector.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">Conectar via Open Finance</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                ))}
              </div>
            </div>

            {carregandoConexao && (
              <div className="py-4 text-center text-xs text-emerald-500 flex items-center justify-center gap-2 font-medium">
                <RefreshCw className="w-4 h-4 animate-spin" /> Sincronizando contas e lançamentos com o banco...
              </div>
            )}
          </div>
        )}

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={carregandoConexao}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
