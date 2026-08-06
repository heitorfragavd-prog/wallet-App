import React, { useState } from "react";
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
import { useDespesas } from "@/domains/finance/hooks/useDespesas";
import { useContasUsuario } from "@/domains/finance/hooks/useContasUsuario";
import { useCategorias } from "@/domains/finance/hooks/useCategorias";
import { format } from "date-fns";
import { MinusCircle, Check } from "lucide-react";

interface NovaDespesaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NovaDespesaModal: React.FC<NovaDespesaModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { toast } = useToast();
  const { createDespesa } = useDespesas();
  const { contas } = useContasUsuario();
  const { categorias } = useCategorias();

  const categoriasDespesa = categorias.filter(c => c.tipo === "despesa");

  const [descricao, setDescricao] = useState("");
  const [valorStr, setValorStr] = useState("0,00");
  const [contaId, setContaId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [data, setData] = useState(format(new Date(), "yyyy-MM-dd"));
  const [metodoPagamento, setMetodoPagamento] = useState("pix");
  const [observacoes, setObservacoes] = useState("");
  const [loading, setLoading] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseValor(valorStr);

    if (!descricao.trim()) {
      toast({ title: "Preencha a descrição", variant: "destructive" });
      return;
    }
    if (val <= 0) {
      toast({ title: "Informe um valor válido", variant: "destructive" });
      return;
    }

    setLoading(true);

    try {
      await createDespesa({
        descricao,
        valor: val,
        data,
        conta_id: contaId || null,
        categoria_id: categoriaId || null,
        metodo_pagamento: metodoPagamento,
        observacoes,
        pago: true,
      });

      toast({
        title: "Despesa registrada! 💸",
        description: `R$ ${valorStr} em "${descricao}".`,
      });

      // Reset
      setDescricao("");
      setValorStr("0,00");
      setObservacoes("");
      onClose();
    } catch (err: any) {
      toast({
        title: "Erro ao criar despesa",
        description: err.message || "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md w-full bg-card border border-border/60 rounded-3xl p-6 shadow-2xl space-y-4">
        <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b border-border/40">
          <DialogTitle className="text-xl font-bold text-rose-500 flex items-center gap-2">
            <MinusCircle className="w-5 h-5" />
            Nova Despesa
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">Descrição</Label>
            <Input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Mercado, Combustível, Farmácia..."
              className="bg-muted/30 border border-border/50 rounded-2xl h-11 text-sm font-medium"
            />
          </div>

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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">Conta / Cartão</Label>
              <select
                value={contaId}
                onChange={(e) => setContaId(e.target.value)}
                className="w-full bg-muted/30 border border-border/50 rounded-2xl h-11 px-3 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-rose-500/50"
              >
                <option value="">Selecione uma conta</option>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">Categoria</Label>
              <select
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value)}
                className="w-full bg-muted/30 border border-border/50 rounded-2xl h-11 px-3 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-rose-500/50"
              >
                <option value="">Selecione a categoria</option>
                {categoriasDespesa.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">Forma de Pagamento</Label>
            <select
              value={metodoPagamento}
              onChange={(e) => setMetodoPagamento(e.target.value)}
              className="w-full bg-muted/30 border border-border/50 rounded-2xl h-11 px-3 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-rose-500/50"
            >
              <option value="pix">PIX</option>
              <option value="cartao_credito">Cartão de Crédito</option>
              <option value="cartao_debito">Cartão de Débito</option>
              <option value="dinheiro">Dinheiro / Espécie</option>
              <option value="boleto">Boleto</option>
              <option value="transferencia">Transferência</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">Observação</Label>
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Detalhes opcionais..."
              className="bg-muted/30 border border-border/50 rounded-2xl text-xs"
              rows={2}
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              disabled={loading}
              className="bg-rose-500 hover:bg-rose-600 text-white font-bold px-6 h-11 rounded-2xl shadow-lg shadow-rose-500/25 w-full"
            >
              <Check className="w-4 h-4 mr-2" />
              Salvar Despesa
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
