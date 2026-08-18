import { useMemo, useState } from "react";
import { Calculator, Info } from "lucide-react";

import { centavosParaDecimal, decimalParaCentavos } from "@/domains/finance/services/equipeCalculations";
import {
  calcularRescisao,
  type MotivoRescisao,
  type TipoAviso,
} from "@/domains/finance/services/equipeRescisao";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";

export type TerminationSimulatorProps = {
  dataAdmissao: string;
  salarioCentavos: number;
  fgtsHistoricoEstimadoCentavos: number;
  dataReferencia?: string;
};

const scenarios: Array<{ value: MotivoRescisao; label: string }> = [
  { value: "sem_justa_causa", label: "Sem justa causa" },
  { value: "acordo", label: "Acordo" },
  { value: "pedido_demissao", label: "Pedido de demissão" },
];

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function TerminationSimulator({
  dataAdmissao,
  salarioCentavos,
  fgtsHistoricoEstimadoCentavos,
  dataReferencia,
}: TerminationSimulatorProps) {
  const defaultDate = dataReferencia || new Date().toISOString().slice(0, 10);
  const [motivo, setMotivo] = useState<MotivoRescisao>("sem_justa_causa");
  const [dataDesligamento, setDataDesligamento] = useState(defaultDate);
  const [aviso, setAviso] = useState<TipoAviso>("indenizado");
  const [saldoFgtsConfirmado, setSaldoFgtsConfirmado] = useState<string>("");
  const [feriasVencidas, setFeriasVencidas] = useState<number>(0);
  const [medias, setMedias] = useState<number>(0);
  const [descontos, setDescontos] = useState<number>(0);

  const resultado = useMemo(() => {
    try {
      const saldoFgtsCentavos = saldoFgtsConfirmado.trim() !== ""
        ? decimalParaCentavos(Number(saldoFgtsConfirmado.replace(",", ".")))
        : null;

      return calcularRescisao({
        motivo,
        dataAdmissao,
        dataDesligamento,
        salarioCentavos,
        aviso,
        saldoFgtsCentavos,
        fgtsHistoricoEstimadoCentavos,
        feriasVencidasPeriodos: feriasVencidas,
        mediasRemuneratoriasCentavos: decimalParaCentavos(medias),
        descontosCentavos: decimalParaCentavos(descontos),
      });
    } catch {
      return null;
    }
  }, [
    motivo,
    dataAdmissao,
    dataDesligamento,
    salarioCentavos,
    aviso,
    saldoFgtsConfirmado,
    fgtsHistoricoEstimadoCentavos,
    feriasVencidas,
    medias,
    descontos,
  ]);

  return (
    <Card className="border-border/50 bg-card/70">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Calculator className="h-5 w-5 text-sky-400" />
            Simulador de desligamento
          </CardTitle>
          <Badge variant="outline" className="text-xs">Somente leitura</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Simule cenários rescisórios de forma auditável e transparente.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-2">
          {scenarios.map((s) => (
            <Button
              key={s.value}
              size="sm"
              variant={motivo === s.value ? "default" : "outline"}
              onClick={() => {
                setMotivo(s.value);
                if (s.value === "pedido_demissao") setAviso("trabalhado");
                else setAviso("indenizado");
              }}
            >
              {s.label}
            </Button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Data prevista de desligamento</Label>
            <Input
              type="date"
              value={dataDesligamento}
              onChange={(e) => setDataDesligamento(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Aviso prévio</Label>
            <Select value={aviso} onValueChange={(val) => setAviso(val as TipoAviso)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o aviso" />
              </SelectTrigger>
              <SelectContent>
                {motivo === "pedido_demissao" ? (
                  <>
                    <SelectItem value="trabalhado">Trabalhado</SelectItem>
                    <SelectItem value="dispensado">Dispensado pelo empregador</SelectItem>
                    <SelectItem value="nao_cumprido">Não cumprido (descontar)</SelectItem>
                  </>
                ) : (
                  <>
                    <SelectItem value="indenizado">Indenizado</SelectItem>
                    <SelectItem value="trabalhado">Trabalhado</SelectItem>
                    <SelectItem value="dispensado">Dispensado</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Saldo FGTS extrato (R$ opcional)</Label>
            <Input
              type="number"
              placeholder="Usar estimado"
              min="0"
              step="0.01"
              value={saldoFgtsConfirmado}
              onChange={(e) => setSaldoFgtsConfirmado(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Férias vencidas (períodos)</Label>
            <Input
              type="number"
              min="0"
              step="1"
              value={feriasVencidas || ""}
              onChange={(e) => setFeriasVencidas(Math.max(0, Number(e.target.value)))}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Médias de horas/variáveis (R$)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={medias || ""}
              onChange={(e) => setMedias(Math.max(0, Number(e.target.value)))}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Outros descontos/faltas (R$)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={descontos || ""}
              onChange={(e) => setDescontos(Math.max(0, Number(e.target.value)))}
            />
          </div>
        </div>

        {resultado ? (
          <div className="space-y-4 rounded-xl border border-border/50 bg-background/50 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Custo estimado para a empresa
                </p>
                <p className="mt-1 text-2xl font-bold text-primary">
                  {money.format(centavosParaDecimal(resultado.totalEmpresaCentavos))}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Inclui verbas rescisórias, depósitos e multa do FGTS
                </p>
              </div>

              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Estimativa líquida do funcionário
                </p>
                <p className="mt-1 text-2xl font-bold text-emerald-400">
                  {money.format(centavosParaDecimal(resultado.totalLiquidoEstimadoCentavos))}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Valor a ser quitado em conta (sem saque do FGTS)
                </p>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-1 border-b border-border/30">
                <span className="text-muted-foreground">Saldo de salário</span>
                <span>{money.format(centavosParaDecimal(resultado.saldoSalarioCentavos))}</span>
              </div>
              {resultado.avisoPrevioCentavos > 0 && (
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">Aviso prévio indenizado</span>
                  <span>{money.format(centavosParaDecimal(resultado.avisoPrevioCentavos))}</span>
                </div>
              )}
              {resultado.descontoAvisoCentavos > 0 && (
                <div className="flex justify-between py-1 border-b border-border/30 text-destructive">
                  <span>Desconto de aviso não cumprido</span>
                  <span>- {money.format(centavosParaDecimal(resultado.descontoAvisoCentavos))}</span>
                </div>
              )}
              <div className="flex justify-between py-1 border-b border-border/30">
                <span className="text-muted-foreground">13º salário proporcional</span>
                <span>{money.format(centavosParaDecimal(resultado.decimoTerceiroCentavos))}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/30">
                <span className="text-muted-foreground">Férias proporcionais + 1/3</span>
                <span>{money.format(centavosParaDecimal(resultado.feriasProporcionaisComTercoCentavos))}</span>
              </div>
              {resultado.feriasVencidasCentavos > 0 && (
                <div className="flex justify-between py-1 border-b border-border/30">
                  <span className="text-muted-foreground">Férias vencidas + 1/3</span>
                  <span>{money.format(centavosParaDecimal(resultado.feriasVencidasCentavos))}</span>
                </div>
              )}
              <div className="flex justify-between py-1 border-b border-border/30">
                <span className="text-muted-foreground">FGTS rescisório (8%)</span>
                <span>{money.format(centavosParaDecimal(resultado.fgtsRescisorioCentavos))}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/30">
                <span className="text-muted-foreground">
                  Multa de {Math.round(resultado.percentualMultaFgts * 100)}% do FGTS ({resultado.fonteSaldoFgts === "confirmada" ? "extrato informado" : "saldo estimado"})
                </span>
                <span>{money.format(centavosParaDecimal(resultado.multaFgtsCentavos))}</span>
              </div>
              <div className="flex justify-between py-1 font-medium">
                <span className="text-muted-foreground">Prazo legal de quitação (art. 477 CLT)</span>
                <span className="text-foreground">{formatDate(resultado.dataLimitePagamento)} (10 dias corridos)</span>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Confirme os valores no eSocial/FGTS Digital e com a contabilidade. Este simulador é estritamente informativo e não produz mutações ou lançamentos no sistema.
              </span>
            </div>
          </div>
        ) : (
          <p className="text-center text-sm text-destructive">
            Data de desligamento inválida ou anterior à data de admissão.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
