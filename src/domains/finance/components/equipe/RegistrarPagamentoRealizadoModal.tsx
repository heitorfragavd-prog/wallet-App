import { useState } from "react";
import { AlertCircle, CheckCircle2, DollarSign, Info } from "lucide-react";

import type { Colaborador } from "@/domains/finance/hooks/useColaboradores";
import { useEquipeAcertos } from "@/domains/finance/hooks/useEquipeAcertos";
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
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Textarea } from "@/shared/components/ui/textarea";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  colaboradores: Colaborador[];
  defaultColaboradorId?: string;
  defaultAcertoId?: string;
  defaultTipo?: string;
  defaultValor?: number;
  defaultDataPagamento?: string;
  onSuccess?: () => void;
};

export function RegistrarPagamentoRealizadoModal({
  open,
  onOpenChange,
  colaboradores,
  defaultColaboradorId,
  defaultAcertoId,
  defaultTipo,
  defaultValor,
  defaultDataPagamento,
  onSuccess,
}: Props) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const currentMonth = todayIso.slice(0, 7);

  const [colaboradorId, setColaboradorId] = useState(defaultColaboradorId || (colaboradores[0]?.id ?? ""));
  const [tipo, setTipo] = useState(defaultTipo || "pro_labore");
  const [mesCompetencia, setMesCompetencia] = useState(currentMonth);
  const [dataPagamento, setDataPagamento] = useState(defaultDataPagamento || todayIso);
  const [valor, setValor] = useState<string>(defaultValor ? String(defaultValor) : "");
  const [origem, setOrigem] = useState<"manual" | "divipay_externo">("manual");
  const [referencia, setReferencia] = useState("");
  const [comprovanteUrl, setComprovanteUrl] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { registrarPagamentoManual } = useEquipeAcertos(colaboradorId || null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const valorNum = parseFloat(valor.replace(",", "."));
    if (!colaboradorId) {
      setErrorMsg("Selecione um integrante da equipe.");
      return;
    }
    if (!valorNum || valorNum <= 0) {
      setErrorMsg("Informe um valor válido maior que zero.");
      return;
    }
    if (!dataPagamento) {
      setErrorMsg("Informe a data em que o pagamento foi realizado.");
      return;
    }
    if (!confirmado) {
      setErrorMsg("É obrigatório confirmar que o pagamento já ocorreu externamente.");
      return;
    }

    try {
      // Calcular datas de início e fim da competência
      const [yearStr, monthStr] = mesCompetencia.split("-");
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      const periodoInicio = `${yearStr}-${monthStr}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const periodoFim = `${yearStr}-${monthStr}-${String(lastDay).padStart(2, "0")}`;

      await registrarPagamentoManual.mutateAsync({
        colaboradorId,
        tipo,
        periodoInicio,
        periodoFim,
        valor: valorNum,
        dataPagamento: `${dataPagamento}T12:00:00-03:00`,
        origem,
        referencia: referencia.trim() || null,
        comprovanteUrl: comprovanteUrl.trim() || null,
        observacoes: observacoes.trim() || null,
        acertoId: defaultAcertoId || null,
      });

      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Não foi possível registrar o pagamento manual."
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <DollarSign className="h-5 w-5 text-emerald-400" />
              Registrar Pagamento Já Realizado
            </DialogTitle>
            <DialogDescription>
              Lance pagamentos quitados externamente (banco, TED ou saque Divipay) para manter o
              extrato financeiro e indicadores 100% conciliados, sem gerar transferências Pix duplicadas.
            </DialogDescription>
          </DialogHeader>

          {errorMsg && (
            <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Colaborador */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="colaborador-select">Integrante da equipe *</Label>
              <Select
                value={colaboradorId}
                onValueChange={(val) => {
                  setColaboradorId(val);
                  const selected = colaboradores.find((c) => c.id === val);
                  if (selected) {
                    if (selected.tipo === "socio") {
                      setTipo("pro_labore");
                      setValor(String(selected.valor_pro_labore || selected.salario_bruto || 5000));
                    } else if (selected.tipo === "funcionario") {
                      setTipo("salario");
                      setValor(String(selected.salario_bruto || ""));
                    } else {
                      setTipo("semanal_folguista");
                    }
                  }
                }}
              >
                <SelectTrigger id="colaborador-select">
                  <SelectValue placeholder="Selecione um integrante" />
                </SelectTrigger>
                <SelectContent>
                  {colaboradores.map((colab) => (
                    <SelectItem key={colab.id} value={colab.id}>
                      {colab.nome} ({colab.cargo || colab.tipo})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tipo de Obrigação */}
            <div className="space-y-1.5">
              <Label htmlFor="tipo-select">Tipo de pagamento *</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger id="tipo-select">
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pro_labore">Pró-labore</SelectItem>
                  <SelectItem value="salario">Salário mensal</SelectItem>
                  <SelectItem value="semanal_funcionario">Transporte semanal</SelectItem>
                  <SelectItem value="semanal_folguista">Diárias folguista</SelectItem>
                  <SelectItem value="adiantamento">Adiantamento</SelectItem>
                  <SelectItem value="bonificacao">Bonificação / Meta</SelectItem>
                  <SelectItem value="outro">Outro pagamento avulso</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Mês da Competência */}
            <div className="space-y-1.5">
              <Label htmlFor="competencia-input">Mês da competência *</Label>
              <Input
                id="competencia-input"
                type="month"
                value={mesCompetencia}
                onChange={(e) => setMesCompetencia(e.target.value)}
                required
              />
            </div>

            {/* Data em que foi pago */}
            <div className="space-y-1.5">
              <Label htmlFor="data-pagamento-input">Data do pagamento real *</Label>
              <Input
                id="data-pagamento-input"
                type="date"
                value={dataPagamento}
                onChange={(e) => setDataPagamento(e.target.value)}
                required
              />
            </div>

            {/* Valor Pago */}
            <div className="space-y-1.5">
              <Label htmlFor="valor-input">Valor pago (R$) *</Label>
              <Input
                id="valor-input"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="Ex: 5000.00"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                required
              />
            </div>

            {/* Forma / Origem */}
            <div className="space-y-1.5">
              <Label htmlFor="origem-select">Forma / Origem *</Label>
              <Select
                value={origem}
                onValueChange={(val: "manual" | "divipay_externo") => setOrigem(val)}
              >
                <SelectTrigger id="origem-select">
                  <SelectValue placeholder="Origem" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Transferência Bancária / Pix Manual</SelectItem>
                  <SelectItem value="divipay_externo">Saque ou Débito Direto Divipay</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Referência / Comprovante */}
            <div className="space-y-1.5">
              <Label htmlFor="ref-input">Referência / Código externo</Label>
              <Input
                id="ref-input"
                placeholder="Ex: divipay-saque:1234 ou Aut. 98765"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
              />
            </div>

            {/* Observações */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="obs-input">Observações</Label>
              <Textarea
                id="obs-input"
                rows={2}
                placeholder="Ex: Pagamento referente a outubro/2026 realizado fora da Wallet"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
              />
            </div>
          </div>

          {/* Confirmação explícita obrigatória */}
          <div className="flex items-start gap-2 rounded-xl border border-border/50 bg-muted/20 p-3 text-xs">
            <Checkbox
              id="confirmar-check"
              checked={confirmado}
              onCheckedChange={(c) => setConfirmado(Boolean(c))}
              className="mt-0.5"
            />
            <label
              htmlFor="confirmar-check"
              className="cursor-pointer text-muted-foreground leading-relaxed"
            >
              <strong className="text-foreground">Confirmo que este pagamento já foi efetuado.</strong>{" "}
              Entendo que esta ação apenas concilia o extrato contábil e a despesa, e que{" "}
              <span className="text-emerald-400 font-semibold">nenhuma ordem Pix</span> será transmitida.
            </label>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={registrarPagamentoManual.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={registrarPagamentoManual.isPending || !confirmado}
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              {registrarPagamentoManual.isPending ? "Gravando..." : "Confirmar e Registrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
