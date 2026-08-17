import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, CreditCard, ShieldCheck } from "lucide-react";

import { divipayService } from "@/domains/divipay/services/DivipayService";
import {
  type EquipeAcerto,
  useEquipeAcertos,
} from "@/domains/finance/hooks/useEquipeAcertos";
import { maskPixKey, type PixKeyType } from "@/domains/finance/services/equipePrivacy";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Label } from "@/shared/components/ui/label";
import { Separator } from "@/shared/components/ui/separator";

type AcertoPaymentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  acerto: EquipeAcerto;
  colaboradorNome: string;
  pixTipo?: PixKeyType;
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function formatDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function inferPixType(pix: string | null): PixKeyType {
  if (!pix) return "aleatoria";
  if (pix.includes("@")) return "email";
  const digits = pix.replace(/\D/g, "");
  if (digits.length === 11) return "cpf";
  if (digits.length === 14) return "cnpj";
  return "aleatoria";
}

export function AcertoPaymentDialog({
  open,
  onOpenChange,
  acerto,
  colaboradorNome,
  pixTipo,
}: AcertoPaymentDialogProps) {
  const { iniciarPagamento, registrarFalha } = useEquipeAcertos(acerto.colaborador_id);
  const [confirmed, setConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);

  useEffect(() => {
    if (!open) {
      setConfirmed(false);
      setError(null);
      setQueued(false);
      setSending(false);
    }
  }, [open]);

  const totals = useMemo(() => {
    return acerto.colaborador_acerto_itens.reduce<Record<string, number>>((acc, item) => {
      acc[item.natureza] = (acc[item.natureza] ?? 0) + Number(item.valor);
      return acc;
    }, {});
  }, [acerto.colaborador_acerto_itens]);

  const pix = acerto.pix_chave_snapshot?.trim() || null;
  const canSubmit = Boolean(pix) && confirmed && !sending && !queued;

  const handlePayment = async () => {
    if (!pix || !canSubmit) return;
    setSending(true);
    setError(null);

    let pagamentoId: string | null = null;
    try {
      const tentativa = await iniciarPagamento.mutateAsync({
        acertoId: acerto.id,
        origem: "wallet_divipay",
      });
      pagamentoId = tentativa.pagamento_id;

      await divipayService.createWithdraw({
        amount: Number(acerto.valor_total),
        keyPix: pix,
        type: "DICT",
        description: `Acerto da equipe - ${colaboradorNome}`,
        metadata: {
          acerto_id: acerto.id,
          pagamento_id: tentativa.pagamento_id,
          workspace_id: acerto.workspace_id,
          idempotency_key: tentativa.idempotency_key,
        },
      });

      setQueued(true);
    } catch (paymentError) {
      if (pagamentoId) {
        try {
          await registrarFalha.mutateAsync({
            pagamentoId,
            erroCodigo: "provider_error",
          });
        } catch {
          // O erro original é o mais útil na tela; a tentativa permanece auditável no ledger.
        }
      }
      setError(paymentError instanceof Error ? paymentError.message : "Não foi possível enviar o pagamento.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-slate-800 bg-slate-950 text-slate-100 sm:max-w-lg">
        <DialogHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400">
            <CreditCard className="h-5 w-5" aria-hidden="true" />
          </div>
          <DialogTitle>Confirmar pagamento do acerto</DialogTitle>
          <DialogDescription className="text-slate-400">
            Revise os dados. O acerto só será marcado como pago após a confirmação do Divipay.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="font-semibold text-slate-100">{colaboradorNome}</p>
            <p className="mt-1 text-sm text-slate-400">
              {formatDate(acerto.periodo_inicio)} a {formatDate(acerto.periodo_fim)}
            </p>
          </section>

          <section aria-label="Composição do acerto" className="space-y-3">
            {acerto.colaborador_acerto_itens.map((item) => (
              <div className="flex items-start justify-between gap-4 text-sm" key={item.id}>
                <div>
                  <p className="font-medium text-slate-200">{item.descricao}</p>
                  <p className="capitalize text-slate-500">{item.natureza.replace("_", " ")}</p>
                </div>
                <span className="shrink-0 font-medium text-slate-200">{money.format(Number(item.valor))}</span>
              </div>
            ))}
            <Separator className="bg-slate-800" />
            <div className="flex items-center justify-between">
              <span className="font-semibold">Total</span>
              <span className="text-xl font-bold text-emerald-400">{money.format(Number(acerto.valor_total))}</span>
            </div>
            {(totals.transporte || totals.meta) && (
              <p className="text-xs text-slate-500">
                Transporte {money.format(totals.transporte ?? 0)} · Metas {money.format(totals.meta ?? 0)}
              </p>
            )}
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden="true" />
              Chave Pix protegida
            </div>
            <p className="mt-2 font-mono text-sm text-slate-200">
              {maskPixKey(pix, pixTipo ?? inferPixType(pix))}
            </p>
          </section>

          {!pix && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>Cadastre uma chave Pix no perfil antes de pagar este acerto.</AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert role="alert" variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {queued && (
            <Alert className="border-emerald-500/30 bg-emerald-500/10 text-emerald-200">
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                Pagamento enviado. Aguardando confirmação do Divipay.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-start gap-3 rounded-xl border border-slate-800 p-4">
            <Checkbox
              id="confirm-payment-data"
              aria-label="Confirmei os dados do pagamento"
              checked={confirmed}
              disabled={!pix || sending || queued}
              onCheckedChange={(value) => setConfirmed(value === true)}
            />
            <Label htmlFor="confirm-payment-data" className="cursor-pointer text-sm leading-5 text-slate-300">
              Confirmei os dados, a composição do acerto e a chave Pix do colaborador.
            </Label>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Fechar
          </Button>
          <Button onClick={handlePayment} disabled={!canSubmit}>
            {sending ? "Enviando…" : queued ? "Enviado" : `Enviar pagamento de ${money.format(Number(acerto.valor_total))}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
