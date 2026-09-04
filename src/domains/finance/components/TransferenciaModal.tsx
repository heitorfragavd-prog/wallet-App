import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { useToast } from "@/shared/hooks/use-toast";
import { useContasUsuario, ContaUsuario, CONTAS_QUERY_KEY } from "@/domains/finance/hooks/useContasUsuario";
import { BankLogoBadge } from "@/shared/components/BankLogoBadge";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { format } from "date-fns";
import {
  ArrowLeftRight,
  Check,
  X,
  Repeat,
  Tag as TagIcon,
  MessageSquare,
  Paperclip,
  Calendar,
  ChevronDown,
} from "lucide-react";

interface TransferenciaModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultOrigemId?: string;
}

export const TransferenciaModal: React.FC<TransferenciaModalProps> = ({
  isOpen,
  onClose,
  defaultOrigemId,
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { activeWorkspace } = useWorkspace();
  const { contas } = useContasUsuario();

  const [saiuContaId, setSaiuContaId] = useState<string>("");
  const [entrouContaId, setEntrouContaId] = useState<string>("");
  const [descricao, setDescricao] = useState<string>("Transferência");
  const [valorStr, setValorStr] = useState<string>("0,00");
  const [data, setData] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [loading, setLoading] = useState<boolean>(false);

  // Extra options toggles
  const [showRepetir, setShowRepetir] = useState<boolean>(false);
  const [showTags, setShowTags] = useState<boolean>(false);
  const [showObservacao, setShowObservacao] = useState<boolean>(false);
  const [showAnexo, setShowAnexo] = useState<boolean>(false);

  const [tagsInput, setTagsInput] = useState<string>("");
  const [observacao, setObservacao] = useState<string>("");

  useEffect(() => {
    if (isOpen) {
      if (defaultOrigemId) {
        setSaiuContaId(defaultOrigemId);
      } else if (contas.length > 0 && !saiuContaId) {
        setSaiuContaId(contas[0].id);
      }
      if (contas.length > 1 && !entrouContaId) {
        const disponivel = contas.find((c) => c.id !== (defaultOrigemId || contas[0]?.id));
        if (disponivel) setEntrouContaId(disponivel.id);
      }
    }
  }, [isOpen, defaultOrigemId, contas]);

  const contaOrigem = contas.find((c) => c.id === saiuContaId);
  const contaDestino = contas.find((c) => c.id === entrouContaId);

  const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    if (!raw) {
      setValorStr("0,00");
      return;
    }
    const val = Number(raw) / 100;
    setValorStr(
      val.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  };

  const parseValor = (val: string): number => {
    return Number(val.replace(/\./g, "").replace(",", ".")) || 0;
  };

  const handleConfirmar = async () => {
    const valorNumerico = parseValor(valorStr);

    if (!saiuContaId) {
      toast({ title: "Erro na transferência", description: "Selecione a conta de origem.", variant: "destructive" });
      return;
    }
    if (!entrouContaId) {
      toast({ title: "Erro na transferência", description: "Selecione a conta de destino.", variant: "destructive" });
      return;
    }
    if (saiuContaId === entrouContaId) {
      toast({ title: "Erro na transferência", description: "A conta de origem e destino devem ser diferentes.", variant: "destructive" });
      return;
    }
    if (valorNumerico <= 0) {
      toast({ title: "Erro na transferência", description: "Informe um valor maior que R$ 0,00.", variant: "destructive" });
      return;
    }

    setLoading(true);

    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Usuário não autenticado.");

      const workspaceId = activeWorkspace?.id || null;

      // 1. Débito na conta de Origem (Registar despesa de transferência)
      const descSaida = `${descricao || "Transferência"} → ${contaDestino?.nome || "Conta Destino"}`;
      await supabase.from("despesas").insert({
        user_id: user.id,
        workspace_id: workspaceId,
        conta_id: saiuContaId,
        descricao: descSaida,
        valor: valorNumerico,
        data: data,
        metodo_pagamento: "transferencia",
        observacoes: observacao || null,
        pago: true,
      });

      // 2. Crédito na conta de Destino (Registrar receita de transferência)
      const descEntrada = `${descricao || "Transferência"} ← ${contaOrigem?.nome || "Conta Origem"}`;
      await supabase.from("receitas").insert({
        user_id: user.id,
        workspace_id: workspaceId,
        conta_id: entrouContaId,
        descricao: descEntrada,
        valor: valorNumerico,
        data: data,
        metodo_pagamento: "transferencia",
        observacoes: observacao || null,
      });

      // 3. Atualizar saldos das contas
      if (contaOrigem) {
        const saldoAtualOrigem = Number(contaOrigem.saldo_atual || contaOrigem.saldo_inicial || 0);
        await supabase
          .from("contas_usuario")
          .update({ saldo_atual: saldoAtualOrigem - valorNumerico } as never)
          .eq("id", saiuContaId);
      }

      if (contaDestino) {
        const saldoAtualDestino = Number(contaDestino.saldo_atual || contaDestino.saldo_inicial || 0);
        await supabase
          .from("contas_usuario")
          .update({ saldo_atual: saldoAtualDestino + valorNumerico } as never)
          .eq("id", entrouContaId);
      }

      // Invalida caches para atualizar UI em tempo real
      queryClient.invalidateQueries({ queryKey: CONTAS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["despesas"] });
      queryClient.invalidateQueries({ queryKey: ["receitas"] });
      queryClient.invalidateQueries({ queryKey: ["transacoes"] });

      toast({
        title: "Transferência Realizada! 🎉",
        description: `R$ ${valorStr} transferidos de ${contaOrigem?.nome} para ${contaDestino?.nome}.`,
      });

      onClose();
    } catch (err: any) {
      toast({
        title: "Erro na transferência",
        description: err.message || "Não foi possível realizar a transferência.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md w-full bg-card border border-border/60 rounded-3xl p-6 shadow-2xl space-y-5">
        <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b border-border/40">
          <DialogTitle className="text-xl font-bold text-foreground flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground">
              <ArrowLeftRight className="w-4 h-4" />
            </div>
            Transferência entre contas
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Campo 1: Saiu da conta */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">Saiu da conta</Label>
            {contaOrigem ? (
              <div className="flex items-center justify-between p-3 rounded-2xl bg-muted/30 border border-border/50">
                <div className="flex items-center gap-3">
                  <BankLogoBadge bankName={contaOrigem.nome} className="w-8 h-8" />
                  <span className="font-semibold text-sm text-foreground">{contaOrigem.nome}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSaiuContaId("")}
                  className="text-muted-foreground hover:text-foreground p-1 rounded-full hover:bg-muted/50 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <select
                  value={saiuContaId}
                  onChange={(e) => setSaiuContaId(e.target.value)}
                  className="w-full bg-muted/30 border border-border/50 rounded-2xl p-3 text-sm text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                >
                  <option value="" disabled>Buscar conta..</option>
                  {contas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} ({new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c.saldo_atual || 0)})
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-muted-foreground absolute right-3 top-3.5 pointer-events-none" />
              </div>
            )}
          </div>

          {/* Campo 2: Entrou na conta */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">Entrou na conta</Label>
            {contaDestino ? (
              <div className="flex items-center justify-between p-3 rounded-2xl bg-muted/30 border border-border/50">
                <div className="flex items-center gap-3">
                  <BankLogoBadge bankName={contaDestino.nome} className="w-8 h-8" />
                  <span className="font-semibold text-sm text-foreground">{contaDestino.nome}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setEntrouContaId("")}
                  className="text-muted-foreground hover:text-foreground p-1 rounded-full hover:bg-muted/50 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <select
                  value={entrouContaId}
                  onChange={(e) => setEntrouContaId(e.target.value)}
                  className="w-full bg-muted/30 border border-border/50 rounded-2xl p-3 text-sm text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                >
                  <option value="" disabled>Buscar conta..</option>
                  {contas
                    .filter((c) => c.id !== saiuContaId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome} ({new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c.saldo_atual || 0)})
                      </option>
                    ))}
                </select>
                <ChevronDown className="w-4 h-4 text-muted-foreground absolute right-3 top-3.5 pointer-events-none" />
              </div>
            )}
          </div>

          {/* Campo 3: Descrição */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">Descrição</Label>
            <Input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descrição da transferência"
              className="bg-muted/30 border border-border/50 rounded-2xl h-11 text-sm font-medium"
            />
          </div>

          {/* Campos 4 & 5 Lado a Lado: Valor e Data */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">Valor</Label>
              <div className="relative">
                <span className="absolute left-3 top-3 text-xs font-bold text-muted-foreground">R$</span>
                <Input
                  value={valorStr}
                  onChange={handleValorChange}
                  className="bg-muted/30 border border-border/50 rounded-2xl h-11 pl-9 font-bold text-sm text-foreground"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">Data</Label>
              <Input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="bg-muted/30 border border-border/50 rounded-2xl h-11 text-sm text-foreground"
              />
            </div>
          </div>

          {/* Opções Opcionais Expansíveis */}
          {showObservacao && (
            <div className="space-y-1 pt-1 animate-in fade-in slide-in-from-top-2">
              <Label className="text-xs font-semibold text-muted-foreground">Observação</Label>
              <Textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Adicione notas adicionais..."
                className="bg-muted/30 border border-border/50 rounded-2xl text-xs"
                rows={2}
              />
            </div>
          )}

          {showTags && (
            <div className="space-y-1 pt-1 animate-in fade-in slide-in-from-top-2">
              <Label className="text-xs font-semibold text-muted-foreground">Tags</Label>
              <Input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="Ex: banco, investimento, pessoal (separadas por vírgula)"
                className="bg-muted/30 border border-border/50 rounded-2xl h-10 text-xs"
              />
            </div>
          )}

          {/* Opções Inferiores com Ícones Circulares */}
          <div className="flex items-center justify-around pt-3 border-t border-border/40">
            <button
              type="button"
              onClick={() => setShowRepetir(!showRepetir)}
              className={`flex flex-col items-center gap-1 text-[11px] font-semibold transition-colors ${
                showRepetir ? "text-emerald-500" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className={`w-10 h-10 rounded-full border flex items-center justify-center transition-colors ${
                showRepetir ? "border-emerald-500 bg-emerald-500/10 text-emerald-500" : "border-border/60 bg-muted/20"
              }`}>
                <Repeat className="w-4 h-4" />
              </div>
              Repetir
            </button>

            <button
              type="button"
              onClick={() => setShowTags(!showTags)}
              className={`flex flex-col items-center gap-1 text-[11px] font-semibold transition-colors ${
                showTags ? "text-emerald-500" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className={`w-10 h-10 rounded-full border flex items-center justify-center transition-colors ${
                showTags ? "border-emerald-500 bg-emerald-500/10 text-emerald-500" : "border-border/60 bg-muted/20"
              }`}>
                <TagIcon className="w-4 h-4" />
              </div>
              Tags
            </button>

            <button
              type="button"
              onClick={() => setShowObservacao(!showObservacao)}
              className={`flex flex-col items-center gap-1 text-[11px] font-semibold transition-colors ${
                showObservacao ? "text-emerald-500" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className={`w-10 h-10 rounded-full border flex items-center justify-center transition-colors ${
                showObservacao ? "border-emerald-500 bg-emerald-500/10 text-emerald-500" : "border-border/60 bg-muted/20"
              }`}>
                <MessageSquare className="w-4 h-4" />
              </div>
              Observação
            </button>

            <button
              type="button"
              onClick={() => setShowAnexo(!showAnexo)}
              className={`flex flex-col items-center gap-1 text-[11px] font-semibold transition-colors ${
                showAnexo ? "text-emerald-500" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className={`w-10 h-10 rounded-full border flex items-center justify-center transition-colors ${
                showAnexo ? "border-emerald-500 bg-emerald-500/10 text-emerald-500" : "border-border/60 bg-muted/20"
              }`}>
                <Paperclip className="w-4 h-4" />
              </div>
              Anexo
            </button>
          </div>

          {/* Botão de Confirmação (Círculo Verde Grande com Checkmark) */}
          <div className="flex justify-center pt-2">
            <button
              type="button"
              disabled={loading}
              onClick={handleConfirmar}
              className="w-14 h-14 rounded-full bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30 transition-all hover:scale-105 disabled:opacity-50"
              title="Confirmar Transferência"
            >
              <Check className="w-7 h-7 stroke-[3]" />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
