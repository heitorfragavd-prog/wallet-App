import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Zap, Copy, Check } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useDivipayTransferencias } from "@/domains/divipay/hooks/useDivipayTransferencias";
import { conciliacaoDivipayService } from "@/domains/divipay/services/ConciliacaoDivipayService";
import { formatCurrency } from "@/lib/utils";
import type { Divida } from "@/domains/finance/hooks/useDividas";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";

interface PagarDividaDivipayModalProps {
  divida: Divida | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

/**
 * Paga uma dívida direto pela carteira Divipay (Pix ou Boleto).
 * O divida_id é gravado na metadata da transação: quando o saque concluir,
 * a conciliação dá baixa automática na dívida (sem duplicar despesa).
 */
export function PagarDividaDivipayModal({ divida, open, onOpenChange, onSuccess }: PagarDividaDivipayModalProps) {
  const [activeTab, setActiveTab] = useState<"pix" | "boleto">("pix");
  const [keyPix, setKeyPix] = useState("");
  const [billetCode, setBilletCode] = useState("");
  const [amount, setAmount] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [confirmedBoleto, setConfirmedBoleto] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  
  const { validateKey, validatedKey, isValidatingKey, createTransferencia, isCreating, resetValidation } =
    useDivipayTransferencias();

  useEffect(() => {
    if (open && divida) {
      setKeyPix(divida.chave_pix || divida.documento_favorecido || "");
      setBilletCode(divida.linha_digitavel || divida.codigo_barras || "");
      setAmount(String(divida.valor_restante.toFixed(2)));
      setConfirmed(false);
      setConfirmedBoleto(false);
      resetValidation();

      // Auto-select tab based on expected payment method
      if (divida.metodo_pagamento_esperado === "boleto") {
        setActiveTab("boleto");
      } else {
        setActiveTab("pix");
      }
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

  const handleCopyBilletCode = () => {
    if (!billetCode) return;
    navigator.clipboard.writeText(billetCode);
    setCopied(true);
    toast({ title: "Copiado", description: "Linha digitável copiada com sucesso." });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmitPix = async (e: React.FormEvent) => {
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
        type: "DICT",
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

  const handleSubmitBoleto = async (e: React.FormEvent) => {
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
    if (!billetCode.trim()) {
      toast({ title: "Código do boleto obrigatório", description: "Informe o código de barras ou linha digitável.", variant: "destructive" });
      return;
    }

    try {
      const transacao = await createTransferencia({
        amount: value,
        type: "BILLET",
        billetCode: billetCode.trim(),
        description: `Pagamento boleto: ${divida.descricao}`,
      });

      // Vincula a dívida na metadata → baixa automática quando o saque concluir
      if (transacao?.id) {
        await conciliacaoDivipayService.vincularDividaNaTransacao(transacao.id, divida.id);
      }

      toast({
        title: "Pagamento de boleto enviado",
        description: "Quando a Divipay liquidar o boleto, a dívida será baixada automaticamente.",
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

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="pix">🔑 Pix</TabsTrigger>
            <TabsTrigger value="boleto">📄 Boleto</TabsTrigger>
          </TabsList>

          <TabsContent value="pix">
            <form onSubmit={handleSubmitPix} className="space-y-4 pt-4">
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
                <Label htmlFor="divipay-amount-pix">Valor (R$) *</Label>
                <Input
                  id="divipay-amount-pix"
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
                  id="divipay-confirm-pix"
                  checked={confirmed}
                  onCheckedChange={(checked) => setConfirmed(checked === true)}
                  className="mt-0.5"
                />
                <Label htmlFor="divipay-confirm-pix" className="text-sm font-normal cursor-pointer leading-relaxed">
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
          </TabsContent>

          <TabsContent value="boleto">
            <form onSubmit={handleSubmitBoleto} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="divipay-billetCode">Código de Barras ou Linha Digitável *</Label>
                <div className="flex gap-2">
                  <Input
                    id="divipay-billetCode"
                    value={billetCode}
                    onChange={(e) => setBilletCode(e.target.value)}
                    placeholder="Cole aqui a linha digitável do boleto"
                    required
                  />
                  {billetCode && (
                    <Button type="button" variant="outline" onClick={handleCopyBilletCode} title="Copiar Linha Digitável">
                      {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="divipay-amount-boleto">Valor (R$) *</Label>
                <Input
                  id="divipay-amount-boleto"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  O valor deve corresponder ao valor de liquidação do boleto.
                </p>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox
                  id="divipay-confirm-boleto"
                  checked={confirmedBoleto}
                  onCheckedChange={(checked) => setConfirmedBoleto(checked === true)}
                  className="mt-0.5"
                />
                <Label htmlFor="divipay-confirm-boleto" className="text-sm font-normal cursor-pointer leading-relaxed">
                  Confirmo que as informações do boleto estão corretas e autorizo o pagamento pela carteira Divipay.
                </Label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                {billetCode && (
                  <Button type="button" variant="outline" onClick={handleCopyBilletCode} className="text-blue-500 border-blue-500/20 hover:bg-blue-500/10 mr-auto">
                    <Copy className="w-4 h-4 mr-2" />
                    Copiar Linha Digitável
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="bg-orange-500 hover:bg-orange-600"
                  disabled={isCreating || !confirmedBoleto}
                >
                  {isCreating ? "Processando..." : `Pagar Boleto via Divipay`}
                </Button>
              </div>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

