import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { PaymentMethodSelector } from "./PaymentMethodSelector";
import { AccountSelector } from "./AccountSelector";
import { usePagamentosDivida } from "../hooks/usePagamentosDivida";
import { PaymentMethod } from "../types";
import { Divida } from "../hooks/useDividas";

interface RegistrarPagamentoModalProps {
  divida: Divida | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function RegistrarPagamentoModal({
  divida,
  open,
  onOpenChange,
  onSuccess,
}: RegistrarPagamentoModalProps) {
  const { createPagamento } = usePagamentosDivida();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    valor: "",
    data_pagamento: new Date().toISOString().split('T')[0],
    metodo_pagamento: null as PaymentMethod | null,
    conta_id: null as string | null,
    observacoes: "",
    criarDespesa: true,
  });
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && divida) {
      // Reset form when modal opens
      setFormData({
        valor: "",
        data_pagamento: new Date().toISOString().split('T')[0],
        metodo_pagamento: null,
        conta_id: null,
        observacoes: "",
        criarDespesa: true,
      });
      setError("");
    }
  }, [open, divida]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!divida) return;

    // Validação de campos obrigatórios
    if (!formData.valor || !formData.data_pagamento || !formData.metodo_pagamento) {
      setError("Preencha todos os campos obrigatórios");
      return;
    }

    const valorPagamento = parseFloat(formData.valor);

    // Validação de valor
    if (isNaN(valorPagamento) || valorPagamento <= 0) {
      setError("Valor inválido");
      return;
    }

    // Validação contra saldo restante
    if (valorPagamento > divida.valor_restante) {
      setError(`O valor do pagamento não pode exceder o saldo restante de R$ ${divida.valor_restante.toFixed(2)}`);
      return;
    }

    setLoading(true);

    const result = await createPagamento(
      divida.id, 
      {
        valor: valorPagamento,
        data_pagamento: formData.data_pagamento,
        metodo_pagamento: formData.metodo_pagamento,
        conta_id: formData.conta_id,
        observacoes: formData.observacoes || undefined,
      },
      formData.criarDespesa
    );

    setLoading(false);

    if (result.data) {
      onOpenChange(false);
      onSuccess?.();
    }
  };

  if (!divida) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 sm:px-6 sm:pt-6 pb-2">
          <DialogTitle className="text-lg">Registrar Pagamento</DialogTitle>
          <DialogDescription className="text-sm">
            {divida.descricao}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 space-y-4">
            {/* Resumo da dívida - compacto */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-muted/50 rounded-lg text-center">
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-sm font-medium">R$ {divida.valor_total.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pago</p>
                <p className="text-sm font-medium text-green-600">R$ {divida.valor_pago.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Restante</p>
                <p className="text-sm font-semibold text-rose-500">R$ {divida.valor_restante.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Parcela</p>
                <p className="text-sm font-semibold text-foreground">R$ {(divida.valor_total / divida.parcelas).toFixed(2)}</p>
              </div>
            </div>

            {/* Campos em grid para telas maiores */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="valor" className="text-sm">Valor *</Label>
                <Input
                  id="valor"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={divida.valor_restante}
                  value={formData.valor}
                  onChange={(e) => setFormData({ ...formData, valor: e.target.value })}
                  placeholder="0,00"
                  className="h-9"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="data_pagamento" className="text-sm">Data *</Label>
                <Input
                  id="data_pagamento"
                  type="date"
                  value={formData.data_pagamento}
                  onChange={(e) => setFormData({ ...formData, data_pagamento: e.target.value })}
                  className="h-9"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Método *</Label>
                <PaymentMethodSelector
                  value={formData.metodo_pagamento}
                  onChange={(method) => setFormData({ ...formData, metodo_pagamento: method })}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">Conta</Label>
                <AccountSelector
                  value={formData.conta_id}
                  onChange={(accountId) => setFormData({ ...formData, conta_id: accountId })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="observacoes" className="text-sm">Observações</Label>
              <Textarea
                id="observacoes"
                value={formData.observacoes}
                onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                placeholder="Observações opcionais..."
                rows={2}
                className="resize-none"
              />
            </div>

            <div className="flex items-center space-x-2 p-2.5 bg-muted/50 rounded-lg">
              <Checkbox
                id="criarDespesa"
                checked={formData.criarDespesa}
                onCheckedChange={(checked) => setFormData({ ...formData, criarDespesa: checked as boolean })}
              />
              <div className="grid gap-0.5 leading-none">
                <Label
                  htmlFor="criarDespesa"
                  className="text-sm font-medium leading-none cursor-pointer"
                >
                  Registrar como despesa
                </Label>
                <p className="text-xs text-muted-foreground">
                  Cria uma despesa automaticamente
                </p>
              </div>
            </div>

            {error && (
              <div className="text-sm text-destructive p-2 bg-destructive/10 rounded">
                {error}
              </div>
            )}
          </div>

          <DialogFooter className="px-4 py-3 sm:px-6 sm:py-4 border-t mt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="h-9"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="h-9">
              {loading ? "Registrando..." : "Registrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
