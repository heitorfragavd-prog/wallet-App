import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Zap } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useDivipayTransferencias } from "@/domains/divipay/hooks/useDivipayTransferencias";
import { conciliacaoDivipayService } from "@/domains/divipay/services/ConciliacaoDivipayService";
import { formatCurrency } from "@/lib/utils";
import type { Divida } from "@/domains/finance/hooks/useDividas";

interface PagarDividaDivipayModalProps {
  divida: Divida | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

/**
 * Paga uma dívida direto pela carteira Divipay (Pix).
 * O divida_id é gravado na metadata da transação: quando o saque concluir,
 * a conciliação dá baixa automática na dívida (sem duplicar despesa).
 */
export function PagarDividaDivipayModal({ divida, open, onOpenChange, onSuccess }: PagarDividaDivipayModalProps) {
  const [keyPix, setKeyPix] = useState("");
  const [amount, setAmount] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const { toast } = useToast();
  const { validateKey, validatedKey, isValidatingKey, createTransferencia, isCreating, resetValidation } =
    useDivipayTransferencias();

  useEffect(() => {
    if (open && divida) {
      setKeyPix(divida.documento_favorecido ?? "");
      setAmount(String(divida.valor_restante.toFixed(2)));
      setConfirmed(false);
      resetValidation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, divida?.id]);

  if (!divida) return null;

  const handleValidate = async () => {
    if (!keyPix.trim()) {
      toast({ title: "Chave Pix obrigatória", description: "Informe a chave Pix do favorecido.", variant: "destructive" });
      return;
    }
    try {
      const result = await validateKey(keyPix.trim());
      if (!result.valid) {
        toast({ title: "Chave inválida", description: result.error || "Não foi possível validar a chave Pix.", variant: "destructive" });
      }
    } catch {
      // erro já exibido pelo hook
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0) {
      toast({ title: "Valor inválido", description: "Informe um valor maior que zero.", variant: "destructive" });
      return;
    }
    if (value > divida.valor_restante) {
      toast({ title: "Valor excede a dívida", description: "O pagamento não pode ser maior que o valor restante.", variant: "destructive" });
      return;
    }
    if (!validatedKey?.valid) {
      toast({ title: "Chave não validada", description: "Valide a chave Pix antes de continuar.", variant: "destructive" });
      return;
    }

    try {
      const transacao = await createTransferencia({
        amount: value,
        keyPix: keyPix.trim(),
        consultId: validatedKey.consultId ?? null,
        description: `Pagamento dívida: ${divida.descricao}`,
      });

      // Vincula a dívida na metadata → baixa automática quando o saque concluir
      if (transacao?.id) {
        await conciliacaoDivipayService.vincularDividaNaTransacao(transacao.id, divida.id);
      }

      toast({
        title: "Pagamento enviado",
        description: "Quando a Divipay confirmar, a dívida será baixada automaticamente.",
      });
      onOpenChange(false);
      onSuccess?.();
    } catch {
      // erro já exibido pelo hook
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-orange-500" />
            Pagar via Divipay
          </DialogTitle>
        </DialogHeader>

        <div className="p-3 rounded-md bg-muted text-sm space-y-1">
          <p><span className="text-muted-foreground">Dívida:</span> <span className="font-medium">{divida.descricao}</span></p>
          <p><span className="text-muted-foreground">Credor:</span> <span className="font-medium">{divida.credor}</span></p>
          <p>
            <span className="text-muted-foreground">Restante:</span>{" "}
            <span className="font-semibold text-rose-500">{formatCurrency(divida.valor_restante)}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="divipay-keyPix">Chave Pix do favorecido *</Label>
            <Input
              id="divipay-keyPix"
              value={keyPix}
              onChange={(e) => {
                setKeyPix(e.target.value);
                if (validatedKey) resetValidation();
              }}
              onBlur={handleValidate}
              placeholder="CPF, CNPJ, email, celular ou chave aleatória"
              required
            />
          </div>

          {isValidatingKey ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-5 w-32" />
            </div>
          ) : validatedKey?.valid ? (
            <div className="p-3 rounded-md bg-muted space-y-1 text-sm">
              <p><span className="text-muted-foreground">Titular:</span> <span className="font-medium">{validatedKey.ownerName}</span></p>
              {validatedKey.ownerDocument && (
                <p><span className="text-muted-foreground">Documento:</span> <span className="font-medium">{validatedKey.ownerDocument}</span></p>
              )}
            </div>
          ) : validatedKey && !validatedKey.valid ? (
            <p className="text-sm text-red-600">{validatedKey.error || "Chave Pix inválida."}</p>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="divipay-amount">Valor (R$) *</Label>
            <Input
              id="divipay-amount"
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Pagamento parcial é aceito: a dívida abate só o valor pago.
            </p>
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id="divipay-confirm"
              checked={confirmed}
              onCheckedChange={(checked) => setConfirmed(checked === true)}
              className="mt-0.5"
            />
            <Label htmlFor="divipay-confirm" className="text-sm font-normal cursor-pointer leading-relaxed">
              Confirmo que a chave Pix é do credor desta dívida e autorizo o pagamento pela carteira Divipay.
            </Label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-orange-500 hover:bg-orange-600"
              disabled={isCreating || !confirmed || !validatedKey?.valid}
            >
              {isCreating ? "Enviando..." : `Pagar ${amount ? formatCurrency(Number(amount)) : ""}`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
