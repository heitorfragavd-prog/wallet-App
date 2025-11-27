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
import { PaymentMethodSelector } from "./PaymentMethodSelector";
import { AccountSelector } from "./AccountSelector";
import { usePagamentosDivida } from "../hooks/usePagamentosDivida";
import { Divida, PaymentMethod } from "../types";

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

    const result = await createPagamento(divida.id, {
      valor: valorPagamento,
      data_pagamento: formData.data_pagamento,
      metodo_pagamento: formData.metodo_pagamento,
      conta_id: formData.conta_id,
      observacoes: formData.observacoes || undefined,
    });

    setLoading(false);

    if (result.data) {
      onOpenChange(false);
      onSuccess?.();
    }
  };

  if (!divida) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Registrar Pagamento</DialogTitle>
          <DialogDescription>
            Registre um pagamento para a dívida: {divida.descricao}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Valor total:</span>
              <span className="font-medium">R$ {divida.valor_total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Valor pago:</span>
              <span className="font-medium">R$ {divida.valor_pago.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Saldo restante:</span>
              <span className="font-semibold text-lg">R$ {divida.valor_restante.toFixed(2)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="valor">Valor do Pagamento *</Label>
            <Input
              id="valor"
              type="number"
              step="0.01"
              min="0.01"
              max={divida.valor_restante}
              value={formData.valor}
              onChange={(e) => setFormData({ ...formData, valor: e.target.value })}
              placeholder="0,00"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="data_pagamento">Data do Pagamento *</Label>
            <Input
              id="data_pagamento"
              type="date"
              value={formData.data_pagamento}
              onChange={(e) => setFormData({ ...formData, data_pagamento: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="metodo_pagamento">Método de Pagamento *</Label>
            <PaymentMethodSelector
              value={formData.metodo_pagamento}
              onChange={(method) => setFormData({ ...formData, metodo_pagamento: method })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="conta">Conta</Label>
            <AccountSelector
              value={formData.conta_id}
              onChange={(accountId) => setFormData({ ...formData, conta_id: accountId })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea
              id="observacoes"
              value={formData.observacoes}
              onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
              placeholder="Adicione observações sobre este pagamento..."
              rows={3}
            />
          </div>

          {error && (
            <div className="text-sm text-destructive">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Registrando..." : "Registrar Pagamento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
