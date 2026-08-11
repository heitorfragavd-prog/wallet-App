import React, { useState, useEffect } from "react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { useToast } from "@/shared/hooks/use-toast";
import { CreditCard, RotateCcw, X, QrCode, Banknote, CheckCircle2, Loader2 } from "lucide-react";
import { pdvActionService } from "../services/pdvActionService";
import type { CartItem } from "../hooks/usePDVCart";

interface Props { open: boolean; onClose: () => void; total: number; items: CartItem[]; onSuccess: (completedPayments: Array<{ method: string; amount: number; transactionId?: string }>) => void; }

type Step = "method" | "processing" | "success" | "cash" | "failed";

export const PDVPaymentModal: React.FC<Props> = ({ open, onClose, total, items, onSuccess }) => {
  const [step, setStep] = useState<Step>("method");
  const [method, setMethod] = useState<"credit" | "debit" | "pix" | "cash">("credit");
  const [cashReceived, setCashReceived] = useState("");
  const [payments, setPayments] = useState<Array<{ method: string; amount: number; transactionId?: string }>>([]);
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const { toast } = useToast();
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const addQuickCash = (valueToAdd: number) => {
    const current = parseFloat(cashReceived) || 0;
    setCashReceived((current + valueToAdd).toFixed(2));
  };

  const remaining = Math.max(0, total - amountPaid);

  useEffect(() => {
    if (open) {
      setStep("method");
      setCashReceived("");
      setPayments([]);
      setAmountPaid(0);
      setCustomAmount(total.toFixed(2));
      setIsRegistering(false);
      setErrorMsg("");
    }
  }, [open, total]);

  useEffect(() => {
    if (open) {
      setCustomAmount(remaining.toFixed(2));
    }
  }, [remaining, open]);

  const handleMachine = (m: "credit" | "debit" | "pix") => {
    const payAmount = parseFloat(customAmount) || 0;
    if (payAmount <= 0 || payAmount > remaining) {
      toast({
        title: "Valor inválido",
        description: `O valor a pagar deve ser maior que zero e menor ou igual a ${fmt(remaining)}.`,
        variant: "destructive",
      });
      return;
    }

    setMethod(m);
    setStep("processing");
  };

  const confirmMachinePayment = async () => {
    const payAmount = parseFloat(customAmount) || 0;
    setIsRegistering(true);
    setErrorMsg("");
    try {
      const res = await pdvActionService.sendToMachine({
        amount: payAmount,
        items: items.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, price: i.price })),
        paymentMethod: method,
      });

      if (res.success) {
        const newPayments = [...payments, { method, amount: payAmount, transactionId: res.transactionId }];
        const newAmountPaid = amountPaid + payAmount;
        setPayments(newPayments);
        setAmountPaid(newAmountPaid);
        setIsRegistering(false);

        const newRemaining = Math.max(0, total - newAmountPaid);
        if (newRemaining <= 0.01) {
          setStep("success");
          toast({ title: "Venda Concluída!", description: "Pedido registrado com sucesso no Eyemobile." });
          setTimeout(() => {
            onSuccess(newPayments);
            onClose();
          }, 2000);
        } else {
          setStep("method");
          toast({ title: "Pagamento parcial registrado!", description: `${fmt(payAmount)} registrados no ${method === "pix" ? "Pix" : method === "credit" ? "Crédito" : "Débito"}.` });
        }
      } else {
        setIsRegistering(false);
        setStep("failed");
        setErrorMsg(res.message || "Erro desconhecido ao registrar o pedido.");
        toast({ title: "Erro ao registrar venda", description: res.message, variant: "destructive" });
      }
    } catch {
      setIsRegistering(false);
      setStep("failed");
      setErrorMsg("Erro de comunicação com o servidor.");
      toast({ title: "Erro na integração", description: "Não foi possível registrar o pedido no Eyemobile.", variant: "destructive" });
    }
  };

  const forceConfirmLocal = () => {
    const payAmount = parseFloat(customAmount) || 0;
    const newPayments = [...payments, { method, amount: payAmount, transactionId: `LOCAL-${Date.now()}` }];
    const newAmountPaid = amountPaid + payAmount;
    setPayments(newPayments);
    setAmountPaid(newAmountPaid);

    toast({ title: "Aprovação Local", description: "Venda concluída apenas no sistema local." });

    const newRemaining = Math.max(0, total - newAmountPaid);
    if (newRemaining <= 0.01) {
      setStep("success");
      setTimeout(() => {
        onSuccess(newPayments);
        onClose();
      }, 1500);
    } else {
      setStep("method");
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;
      if (step === "processing") {
        if (e.key === "F4") {
          e.preventDefault();
          if (!isRegistering) {
            confirmMachinePayment();
          }
        } else if (e.key === "Escape") {
          e.preventDefault();
          setStep("method");
        }
      } else if (step === "cash") {
        if (e.key === "Escape") {
          e.preventDefault();
          setStep("method");
        }
      } else if (step === "method") {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, step, customAmount, method, amountPaid, payments, items, isRegistering]);

  const handleCash = () => {
    const payAmount = parseFloat(customAmount) || 0;
    const received = Number(cashReceived);
    if (received < payAmount) {
      toast({
        title: "Valor insuficiente",
        description: "O valor recebido deve ser maior ou igual ao valor a pagar.",
        variant: "destructive",
      });
      return;
    }

    const change = received - payAmount;
    const newPayments = [...payments, { method: "cash", amount: payAmount }];
    const newAmountPaid = amountPaid + payAmount;
    setPayments(newPayments);
    setAmountPaid(newAmountPaid);

    toast({
      title: "Pagamento em Dinheiro Aprovado!",
      description: `Valor: ${fmt(payAmount)} | Troco: ${fmt(change)}`,
    });

    const newRemaining = Math.max(0, total - newAmountPaid);
    if (newRemaining <= 0.01) {
      setStep("success");
      setTimeout(() => {
        onSuccess(newPayments);
        onClose();
      }, 2000);
    } else {
      setStep("method");
      setCashReceived("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md bg-[#0B132B]/95 backdrop-blur-xl border border-[#1E2942] text-white rounded-3xl p-0 overflow-hidden">
        {step === "method" && (
          <div className="p-6 space-y-5">
            <DialogHeader className="p-0">
              <DialogTitle className="text-lg font-extrabold flex items-center gap-2 text-white">
                <CreditCard className="w-5 h-5 text-emerald-400" />
                Forma de Pagamento
              </DialogTitle>
            </DialogHeader>

            <div className="bg-[#1C2541]/40 border border-[#1E2942] rounded-2xl p-4 space-y-2">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Total da Venda</span>
                <span className="font-mono font-bold text-slate-200">{fmt(total)}</span>
              </div>
              
              {payments.length > 0 && (
                <div className="space-y-1 py-1 border-t border-b border-[#1E2942]/60">
                  <span className="text-[10px] font-bold text-emerald-400 block uppercase">PAGAMENTOS RECEBIDOS:</span>
                  {payments.map((p, idx) => (
                    <div key={idx} className="flex justify-between text-[11px] font-medium text-slate-300">
                      <span>
                        {p.method === "cash"
                          ? "💵 Dinheiro"
                          : p.method === "pix"
                          ? "⚡ PIX"
                          : p.method === "credit"
                          ? "💳 Crédito"
                          : "💳 Débito"}
                      </span>
                      <span className="font-mono">{fmt(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-between items-end pt-1">
                <span className="text-xs font-bold text-slate-300">RESTANTE A PAGAR:</span>
                <span className="text-2xl font-extrabold text-emerald-400">{fmt(remaining)}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase">Valor a Pagar Agora (R$)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-bold">R$</span>
                <Input
                  type="number"
                  step="0.01"
                  className="pl-10 bg-[#1C2541]/50 border-[#1E2942] text-slate-100 font-mono font-bold text-base focus-visible:ring-emerald-500/30"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder="0,00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-16 flex flex-col items-center justify-center gap-1 bg-[#1C2541]/80 border-[#1E2942] hover:bg-emerald-500/10 hover:border-emerald-500/40 text-slate-100 hover:text-white rounded-xl"
                onClick={() => handleMachine("credit")}
              >
                <CreditCard className="w-5 h-5 text-emerald-400" />
                <span className="text-xs font-bold text-slate-200">Crédito</span>
              </Button>
              <Button
                variant="outline"
                className="h-16 flex flex-col items-center justify-center gap-1 bg-[#1C2541]/80 border-[#1E2942] hover:bg-emerald-500/10 hover:border-emerald-500/40 text-slate-100 hover:text-white rounded-xl"
                onClick={() => handleMachine("debit")}
              >
                <CreditCard className="w-5 h-5 text-blue-400" />
                <span className="text-xs font-bold text-slate-200">Débito</span>
              </Button>
              <Button
                variant="outline"
                className="h-16 flex flex-col items-center justify-center gap-1 bg-[#1C2541]/80 border-[#1E2942] hover:bg-emerald-500/10 hover:border-emerald-500/40 text-slate-100 hover:text-white rounded-xl"
                onClick={() => handleMachine("pix")}
              >
                <QrCode className="w-5 h-5 text-purple-400" />
                <span className="text-xs font-bold text-slate-200">PIX</span>
              </Button>
              <Button
                variant="outline"
                className="h-16 flex flex-col items-center justify-center gap-1 bg-[#1C2541]/80 border-[#1E2942] hover:bg-emerald-500/10 hover:border-emerald-500/40 text-slate-100 hover:text-white rounded-xl"
                onClick={() => setStep("cash")}
              >
                <Banknote className="w-5 h-5 text-amber-400" />
                <span className="text-xs font-bold text-slate-200">Dinheiro</span>
              </Button>
            </div>
          </div>
        )}
        {step === "processing" && (
          <div className="p-8 flex flex-col items-center text-center space-y-5">
            {isRegistering ? (
              <>
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 animate-pulse">
                  <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Sincronizando com Eyemobile</h3>
                  <p className="text-sm text-slate-400 mt-1">Registrando a venda e atualizando o estoque...</p>
                </div>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/20 animate-pulse">
                  <CreditCard className="w-8 h-8 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Aguardando Pagamento</h3>
                  <p className="text-sm text-slate-400 mt-1 leading-relaxed">
                    Passe o valor de <strong className="text-emerald-400 font-mono text-base">{fmt(parseFloat(customAmount) || 0)}</strong> no {method === "pix" ? "PIX" : method === "credit" ? "Crédito" : "Débito"} na maquininha física.
                  </p>
                </div>
                <div className="flex flex-col gap-2 w-full pt-2">
                  <Button className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-11 rounded-xl shadow-lg shadow-emerald-500/20 active:scale-[0.98]" onClick={confirmMachinePayment}>
                    <CheckCircle2 className="w-4 h-4 mr-2" />[F4] Confirmar Pagamento Aprovado
                  </Button>
                  <Button variant="outline" className="w-full border-rose-500/30 text-rose-400 hover:bg-rose-500/10 h-11 rounded-xl" onClick={() => setStep("method")}>
                    <X className="w-4 h-4 mr-2" />[ESC] Cancelar
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
        {step === "success" && (
          <div className="p-8 flex flex-col items-center text-center space-y-5">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30"><CheckCircle2 className="w-8 h-8 text-emerald-400" /></div>
            <div><h3 className="text-lg font-bold text-emerald-400">Venda Concluída!</h3><p className="text-sm text-slate-400 mt-1">Pedido registrado com sucesso no Eyemobile.</p></div>
            <p className="text-xs text-slate-500">Preparando próxima venda...</p>
          </div>
        )}
        {step === "failed" && (
          <div className="p-8 flex flex-col items-center text-center space-y-5">
            <div className="w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center border border-rose-500/20"><X className="w-8 h-8 text-rose-400" /></div>
            <div>
              <h3 className="text-lg font-bold text-rose-400">Falha ao Registrar</h3>
              <p className="text-sm text-slate-400 mt-1">
                O pagamento foi feito, mas o registro no Eyemobile falhou:
                <span className="block font-mono text-xs text-rose-300 mt-1">{errorMsg}</span>
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full pt-2">
              <Button className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-11 rounded-xl" onClick={confirmMachinePayment}>
                <RotateCcw className="w-4 h-4 mr-2" />Tentar Registrar Novamente
              </Button>
              <Button variant="outline" className="w-full border-amber-500/30 text-amber-400 hover:bg-amber-500/10 h-11 rounded-xl" onClick={forceConfirmLocal}>
                Forçar Aprovação Local
              </Button>
              <Button variant="ghost" className="text-slate-400 hover:bg-slate-800 h-11 rounded-xl" onClick={() => setStep("method")}>
                Voltar
              </Button>
            </div>
          </div>
        )}
        {step === "cash" && (
          <div className="p-6 space-y-5">
            <DialogHeader className="p-0">
              <DialogTitle className="text-lg font-extrabold flex items-center gap-2 text-white">
                <Banknote className="w-5 h-5 text-amber-400" />
                Pagamento em Dinheiro
              </DialogTitle>
            </DialogHeader>
            <div className="text-center py-2">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Valor a Pagar em Dinheiro</p>
              <p className="text-3xl font-extrabold text-emerald-400 mt-1">{fmt(parseFloat(customAmount) || 0)}</p>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-200">Valor Recebido (R$)</label>
                {cashReceived && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] text-rose-400 hover:bg-rose-500/10 font-bold"
                    onClick={() => setCashReceived("")}
                  >
                    Limpar
                  </Button>
                )}
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-300 font-bold">R$</span>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  className="pl-10 bg-[#1C2541]/80 border-[#1E2942] text-lg font-mono text-white focus-visible:ring-emerald-500/30 font-bold"
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                  autoFocus
                />
              </div>

              {/* Botões Rápidos de Dinheiro */}
              <div className="space-y-2 pt-1 select-none">
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 border-[#1E2942] bg-[#1C2541]/50 text-xs font-bold text-slate-200 hover:bg-emerald-500/10 hover:text-emerald-400 rounded-xl"
                    onClick={() => {
                      const payAmt = parseFloat(customAmount) || 0;
                      setCashReceived(payAmt.toFixed(2));
                    }}
                  >
                    Valor Exato
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 border-[#1E2942] bg-[#1C2541]/50 text-xs font-bold text-slate-200 hover:bg-emerald-500/10 hover:text-emerald-400 rounded-xl"
                    onClick={() => addQuickCash(2)}
                  >
                    + R$ 2,00
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 border-[#1E2942] bg-[#1C2541]/50 text-xs font-bold text-slate-200 hover:bg-emerald-500/10 hover:text-emerald-400 rounded-xl"
                    onClick={() => addQuickCash(5)}
                  >
                    + R$ 5,00
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 border-[#1E2942] bg-[#1C2541]/50 text-xs font-bold text-slate-200 hover:bg-emerald-500/10 hover:text-emerald-400 rounded-xl"
                    onClick={() => addQuickCash(10)}
                  >
                    + R$ 10,00
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 border-[#1E2942] bg-[#1C2541]/50 text-xs font-bold text-slate-200 hover:bg-emerald-500/10 hover:text-emerald-400 rounded-xl"
                    onClick={() => addQuickCash(20)}
                  >
                    + R$ 20,00
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 border-[#1E2942] bg-[#1C2541]/50 text-xs font-bold text-slate-200 hover:bg-emerald-500/10 hover:text-emerald-400 rounded-xl"
                    onClick={() => addQuickCash(50)}
                  >
                    + R$ 50,00
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 border-[#1E2942] bg-[#1C2541]/50 text-xs font-bold text-slate-200 hover:bg-emerald-500/10 hover:text-emerald-400 rounded-xl"
                    onClick={() => addQuickCash(100)}
                  >
                    + R$ 100,00
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 border-[#1E2942] bg-[#1C2541]/50 text-xs font-bold text-slate-200 hover:bg-emerald-500/10 hover:text-emerald-400 rounded-xl"
                    onClick={() => addQuickCash(200)}
                  >
                    + R$ 200,00
                  </Button>
                </div>
              </div>

              {Number(cashReceived) >= (parseFloat(customAmount) || 0) ? (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex justify-between items-center mt-2 animate-fade-in">
                  <span className="text-xs font-bold text-slate-300">TROCO A DEVOLVER:</span>
                  <span className="text-lg font-extrabold text-emerald-400">{fmt(Number(cashReceived) - (parseFloat(customAmount) || 0))}</span>
                </div>
              ) : cashReceived && Number(cashReceived) > 0 ? (
                <p className="text-xs font-semibold text-rose-400 mt-1">
                  Faltando: {fmt((parseFloat(customAmount) || 0) - Number(cashReceived))}
                </p>
              ) : null}
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-11 rounded-xl shadow-lg shadow-emerald-500/20 active:scale-[0.98]"
                onClick={handleCash}
                disabled={Number(cashReceived) < (parseFloat(customAmount) || 0)}
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Confirmar Pagamento
              </Button>
              <Button
                variant="outline"
                className="border-[#1E2942] text-slate-300 hover:bg-slate-800 h-11 rounded-xl"
                onClick={() => setStep("method")}
              >
                Voltar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
