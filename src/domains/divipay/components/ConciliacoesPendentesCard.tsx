import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { CheckCircle2, FilePlus2, EyeOff, GitMerge } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  useDivipayConciliacao,
  useDivipayConciliacoes,
} from "@/domains/divipay/hooks/useDivipayConciliacao";
import { useDividas } from "@/domains/finance/hooks/useDividas";

const formatarData = (iso: string | null) => {
  if (!iso) return "---";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR");
};

/**
 * Inbox da Camada 2 da conciliação: saques cujo valor bate com uma dívida,
 * mas que precisam de confirmação humana antes da baixa.
 */
export function ConciliacoesPendentesCard() {
  const { data: pendentes = [], isLoading } = useDivipayConciliacoes("pendente");
  const { dividas } = useDividas();
  const { confirmar, importarAvulsa, ignorar, isConfirmando } = useDivipayConciliacao();

  if (isLoading) {
    return (
      <Card className="rounded-2xl border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-4 space-y-2">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (pendentes.length === 0) return null;

  const descricaoDivida = (id: string | null) => {
    if (!id) return null;
    const d = dividas.find((x) => x.id === id);
    return d ? `${d.descricao} (${d.credor})` : null;
  };

  return (
    <Card className="rounded-2xl border-amber-500/40 bg-amber-500/5 shadow-sm overflow-hidden">
      <CardHeader className="p-4 border-b border-amber-500/20">
        <CardTitle className="text-sm font-bold flex items-center gap-2 text-amber-600 dark:text-amber-400">
          <GitMerge className="w-4 h-4" />
          Conciliação pendente ({pendentes.length})
          <span className="text-xs font-normal text-muted-foreground">
            — estes pagamentos parecem quitar dívidas. Confirme para dar baixa.
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 divide-y divide-amber-500/10">
        {pendentes.map((c) => {
          const sugestao = descricaoDivida(c.divida_sugerida_id);
          return (
            <div key={c.id} className="p-4 flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-foreground truncate">
                    {c.favorecido_nome ?? "Favorecido não identificado"}
                  </span>
                  <Badge variant="outline" className="text-[10px] font-bold">
                    {c.tipo === "BILLET" ? "Boleto" : "Pix"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{formatarData(c.data_pagamento)}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  <span>
                    Valor: <strong className="text-foreground">{formatCurrency(Number(c.valor))}</strong>
                  </span>
                  {Number(c.taxa) > 0 && <span>Taxa: {formatCurrency(Number(c.taxa))}</span>}
                  {c.favorecido_documento && <span className="font-mono">{c.favorecido_documento}</span>}
                </div>
                {sugestao && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Sugestão: quitar a dívida <strong>{sugestao}</strong>
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {c.divida_sugerida_id && (
                  <Button
                    size="sm"
                    onClick={() => confirmar(c, c.divida_sugerida_id!)}
                    disabled={isConfirmando}
                    className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    Baixar dívida
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => importarAvulsa(c)}
                  className="h-8 text-xs"
                  title="Não é pagamento de dívida: importar como despesa avulsa"
                >
                  <FilePlus2 className="w-3.5 h-3.5 mr-1" />
                  Despesa avulsa
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => ignorar(c.id)}
                  className="h-8 text-xs text-muted-foreground"
                  title="Não importar este saque (ex: transferência entre contas próprias)"
                >
                  <EyeOff className="w-3.5 h-3.5 mr-1" />
                  Ignorar
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
