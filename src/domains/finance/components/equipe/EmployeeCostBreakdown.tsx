import { AlertTriangle, ExternalLink, ShieldCheck } from "lucide-react";

import { centavosParaDecimal } from "@/domains/finance/services/equipeCalculations";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";

export type EmployeeCostBreakdownProps = {
  salarioCentavos: number;
  inssEmpresaCentavos: number;
  fgtsCentavos: number;
  decimoTerceiroCentavos: number;
  feriasCentavos: number;
  pisoCategoriaCentavos?: number | null;
  convencaoMte?: string | null;
  fonteUrl?: string | null;
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function EmployeeCostBreakdown({
  salarioCentavos,
  inssEmpresaCentavos,
  fgtsCentavos,
  decimoTerceiroCentavos,
  feriasCentavos,
  pisoCategoriaCentavos,
  convencaoMte,
  fonteUrl,
}: EmployeeCostBreakdownProps) {
  const salario = centavosParaDecimal(salarioCentavos);
  const inss = centavosParaDecimal(inssEmpresaCentavos);
  const fgts = centavosParaDecimal(fgtsCentavos);
  const decimoTerceiro = centavosParaDecimal(decimoTerceiroCentavos);
  const ferias = centavosParaDecimal(feriasCentavos);
  const totalFixo = salario + inss + fgts + decimoTerceiro + ferias;

  const isAbaixoDoPiso = Boolean(
    pisoCategoriaCentavos && pisoCategoriaCentavos > salarioCentavos,
  );
  const diferencaPiso = isAbaixoDoPiso && pisoCategoriaCentavos
    ? centavosParaDecimal(pisoCategoriaCentavos - salarioCentavos)
    : 0;

  // Se o INSS patronal é ~3% do salário, estamos no regime MEI; senão ~20%
  const isMei = salarioCentavos > 0 && Math.abs(inssEmpresaCentavos / salarioCentavos - 0.03) < 0.01;
  const inssPercent = isMei ? "3%" : "20%";

  return (
    <Card className="border-border/50 bg-card/70">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <ShieldCheck className="h-5 w-5 text-emerald-400" />
          Composição mensal de custo fixo
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Encargos e provisões trabalhistas calculados conforme o regime do workspace.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isAbaixoDoPiso && (
          <div
            role="alert"
            className="flex flex-col gap-1 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                Salário base abaixo do piso da categoria ({money.format(centavosParaDecimal(pisoCategoriaCentavos!))}) — diferença informativa de {money.format(diferencaPiso)}.
              </span>
            </div>
            {fonteUrl && (
              <a
                href={fonteUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 font-medium underline hover:text-amber-200"
              >
                Ver {convencaoMte || "convenção"} no MTE
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        )}

        <div className="grid gap-2 text-sm">
          <div className="flex justify-between py-1 border-b border-border/30">
            <span className="text-muted-foreground">Salário base</span>
            <span className="font-medium">{money.format(salario)}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-border/30">
            <span className="text-muted-foreground">INSS patronal ({inssPercent})</span>
            <span className="font-medium">{money.format(inss)}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-border/30">
            <span className="text-muted-foreground">FGTS (8%)</span>
            <span className="font-medium">{money.format(fgts)}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-border/30">
            <span className="text-muted-foreground">13º salário provisionado</span>
            <span className="font-medium">{money.format(decimoTerceiro)}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-border/30">
            <span className="text-muted-foreground">Férias + 1/3 provisionadas</span>
            <span className="font-medium">{money.format(ferias)}</span>
          </div>
          <div className="flex items-center justify-between pt-2 text-base font-bold text-emerald-400">
            <span>Total fixo mensal</span>
            <span>{money.format(totalFixo)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
