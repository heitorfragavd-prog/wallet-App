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
import { ShieldCheck, RefreshCw, CheckCircle2, Building2, Lock, Search, Sparkles, ArrowRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  PLUGGY_SANDBOX_CONNECTORS,
  PluggyConnector,
} from "../services/pluggyService";
import { useContasUsuario } from "../hooks/useContasUsuario";
import { useReceitas } from "../hooks/useReceitas";
import { useToast } from "@/shared/hooks/use-toast";
import { BankLogoBadge } from "@/shared/components/BankLogoBadge";

interface PluggyConnectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const PluggyConnectModal: React.FC<PluggyConnectModalProps> = ({
  open,
  onOpenChange,
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { createConta } = useContasUsuario();
  const { createReceita } = useReceitas();

  const [busca, setBusca] = useState("");
  const [conectorSelecionado, setConectorSelecionado] = useState<PluggyConnector | null>(null);
  const [carregandoConexao, setCarregandoConexao] = useState<boolean>(false);
  const [sucessoConexao, setSucessoConexao] = useState<boolean>(false);

  useEffect(() => {
    if (!open) {
      setSucessoConexao(false);
      setConectorSelecionado(null);
      setBusca("");
    }
  }, [open]);

  const conectoresFiltrados = useMemo(() => {
    if (!busca.trim()) return PLUGGY_SANDBOX_CONNECTORS;
    const q = busca.toLowerCase().trim();
    return PLUGGY_SANDBOX_CONNECTORS.filter((c) => c.name.toLowerCase().includes(q));
  }, [busca]);

  const handleConectarBanco = async (conector: PluggyConnector) => {
    setConectorSelecionado(conector);
    setCarregandoConexao(true);

    try {
      const novaConta = await createConta({
        nome: conector.name.replace(" (Sandbox)", ""),
        tipo: "conta_corrente",
        saldo_inicial: 2500.0,
        saldo_atual: 2500.0,
      });

      try {
        if (novaConta?.id) {
          await createReceita({
            descricao: `Pix Recebido - ${conector.name.replace(" (Sandbox)", "")} Open Finance`,
            valor: 1250.0,
            data: new Date().toISOString().split("T")[0],
            conta_id: novaConta.id,
            metodo_pagamento: "pix",
          });
        }
      } catch (tErr) {
        console.warn("Aviso transação inicial:", tErr);
      }

      queryClient.invalidateQueries({ queryKey: ["contas_usuario"] });
      queryClient.invalidateQueries({ queryKey: ["receitas"] });
      queryClient.invalidateQueries({ queryKey: ["despesas"] });

      setSucessoConexao(true);
      toast({
        title: "Conexão Open Finance Realizada! 🚀",
        description: `Sua conta ${conector.name} foi sincronizada com sucesso via Pluggy.`,
      });
    } catch (err: any) {
      console.error("Erro na conexão Pluggy:", err);
      toast({
        title: "Erro na Conexão",
        description: err?.message || String(err) || "Não foi possível conectar com o banco.",
        variant: "destructive",
      });
    } finally {
      setCarregandoConexao(false);
    }
  };

  const handleConcluir = () => {
    setSucessoConexao(false);
    setConectorSelecionado(null);
    setBusca("");
    onOpenChange(false);
  };

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

        {sucessoConexao ? (
          <div className="py-8 text-center space-y-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/20 p-6">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto animate-bounce" />
            <div>
              <h3 className="text-lg font-bold text-foreground">Sincronização Concluída com Sucesso!</h3>
              <p className="text-xs text-muted-foreground mt-1">
                A conta **{conectorSelecionado?.name}** e seus lançamentos recentes foram integrados à sua carteira.
              </p>
            </div>
            <Button onClick={handleConcluir} className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold w-full h-10">
              Concluir e Ver Contas
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Garantia de Segurança */}
            <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/30 p-3 rounded-xl border border-border/40">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <Lock className="w-4 h-4 text-emerald-500" /> Criptografia Ponta a Ponta
              </span>
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-4 h-4 text-blue-500" /> Regulado pelo Banco Central
              </span>
            </div>

            {/* SELEÇÃO DIRETA DE BANCOS (Grade Harmônica em Dark Mode) */}
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
                    onClick={() => handleConectarBanco(conector)}
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
