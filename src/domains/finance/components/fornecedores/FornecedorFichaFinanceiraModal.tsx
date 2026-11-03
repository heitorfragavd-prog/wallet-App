import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Input } from "@/shared/components/ui/input";
import { Card, CardContent } from "@/shared/components/ui/card";
import {
  DollarSign,
  Calendar,
  Receipt,
  Clock,
  AlertCircle,
  Search,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Building2,
  QrCode,
  FileText,
} from "lucide-react";
import { useFornecedorFinanceiro } from "@/domains/finance/hooks/useFornecedorFinanceiro";
import type { Contato } from "@/domains/finance/hooks/useContatos";

interface FornecedorFichaFinanceiraModalProps {
  fornecedor: Contato | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEditar?: (fornecedor: Contato) => void;
}

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export const FornecedorFichaFinanceiraModal: React.FC<FornecedorFichaFinanceiraModalProps> = ({
  fornecedor,
  open,
  onOpenChange,
  onEditar,
}) => {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [busca, setBusca] = useState("");
  const [filtroMetodo, setFiltroMetodo] = useState<"todos" | "pix" | "boleto">("todos");
  const [filtroStatus] = useState<"todos" | "pago" | "pendente">("todos");

  const { data: resumo, isLoading } = useFornecedorFinanceiro({
    fornecedorId: fornecedor?.id,
    fornecedorNome: fornecedor?.nome,
    fornecedorCnpjCpf: fornecedor?.cnpj_cpf,
    ano,
    mes,
  });

  if (!fornecedor) return null;

  const anteriorMes = () => {
    if (mes === 1) {
      setMes(12);
      setAno((a) => a - 1);
    } else {
      setMes((m) => m - 1);
    }
  };

  const proximoMes = () => {
    if (mes === 12) {
      setMes(1);
      setAno((a) => a + 1);
    } else {
      setMes((m) => m + 1);
    }
  };

  const historicoFiltrado = (resumo?.historico ?? []).filter((item) => {
    if (filtroMetodo !== "todos" && item.metodoPagamento !== filtroMetodo) return false;
    if (filtroStatus !== "todos" && item.status !== filtroStatus) return false;
    if (busca.trim()) {
      const termo = busca.toLowerCase();
      const matchDesc = item.descricao.toLowerCase().includes(termo);
      const matchRef = item.divipayExternalId?.toLowerCase().includes(termo);
      const matchCat = item.categoriaNome.toLowerCase().includes(termo);
      if (!matchDesc && !matchRef && !matchCat) return false;
    }
    return true;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-4 md:p-6">
        <DialogHeader className="border-b pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
                <Building2 className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                  {fornecedor.nome}
                  {fornecedor.ativo ? (
                    <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 bg-emerald-500/10 text-xs">
                      Ativo
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground border-border text-xs">
                      Inativo
                    </Badge>
                  )}
                </DialogTitle>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-0.5">
                  {fornecedor.nome_fantasia && <span>Fantasia: {fornecedor.nome_fantasia}</span>}
                  {fornecedor.cnpj_cpf && <span>CNPJ/CPF: {fornecedor.cnpj_cpf}</span>}
                  {fornecedor.pix_chave && (
                    <span className="text-primary font-mono flex items-center gap-1">
                      <QrCode className="h-3 w-3" /> Pix: {fornecedor.pix_chave}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {onEditar && (
              <Button size="sm" variant="outline" onClick={() => onEditar(fornecedor)} className="self-start md:self-auto">
                Editar Cadastro
              </Button>
            )}
          </div>
        </DialogHeader>

        {/* Seletor de Competência Mensal */}
        <div className="flex items-center justify-between bg-muted/40 p-2.5 rounded-lg border border-border/50">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium text-foreground">Competência de Análise:</span>
          </div>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={anteriorMes}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold px-2 min-w-[120px] text-center">
              {MESES[mes - 1]} / {ano}
            </span>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={proximoMes}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Cards de Indicadores Financeiros */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-card/70 border-border/60">
            <CardContent className="p-3.5 space-y-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5 text-emerald-400" /> Total Pago no Mês
              </span>
              <p className="text-lg font-bold text-foreground">
                R$ {(resumo?.totalPagoNoMes ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-muted-foreground">{resumo?.qtdPagamentos ?? 0} pagamento(s)</p>
            </CardContent>
          </Card>

          <Card className="bg-card/70 border-border/60">
            <CardContent className="p-3.5 space-y-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <QrCode className="h-3.5 w-3.5 text-sky-400" /> Pago via Pix
              </span>
              <p className="text-lg font-bold text-sky-400">
                R$ {(resumo?.totalPagoPix ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
              <span className="text-xs text-muted-foreground flex items-center gap-1 pt-1">
                <FileText className="h-3.5 w-3.5 text-amber-400" /> Boleto: R$ {(resumo?.totalPagoBoleto ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </span>
            </CardContent>
          </Card>

          <Card className="bg-card/70 border-border/60">
            <CardContent className="p-3.5 space-y-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-amber-400" /> Obrigações Abertas
              </span>
              <p className="text-lg font-bold text-amber-400">
                R$ {(resumo?.totalPendente ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
              {resumo && resumo.totalVencido > 0 ? (
                <p className="text-[11px] text-destructive font-medium flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Vencidas: R$ {resumo.totalVencido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">Em dia</p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/70 border-border/60">
            <CardContent className="p-3.5 space-y-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Receipt className="h-3.5 w-3.5 text-primary" /> Último Pagamento
              </span>
              {resumo?.ultimoPagamento ? (
                <>
                  <p className="text-sm font-bold text-foreground">
                    R$ {resumo.ultimoPagamento.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {resumo.ultimoPagamento.data} ({resumo.ultimoPagamento.metodo.toUpperCase()})
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground pt-1">Sem pagamentos confirmados</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Seção de Histórico Financeiro */}
        <div className="space-y-3 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" /> Histórico Financeiro e Comprovantes
            </h3>

            {/* Filtros rápidos */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-40 sm:w-48">
                <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar histórico..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="h-8 pl-7 text-xs"
                />
              </div>

              <div className="flex rounded-md border border-border p-0.5 bg-muted/30">
                <button
                  type="button"
                  onClick={() => setFiltroMetodo("todos")}
                  className={`px-2 py-1 text-xs rounded ${filtroMetodo === "todos" ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground"}`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroMetodo("pix")}
                  className={`px-2 py-1 text-xs rounded ${filtroMetodo === "pix" ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground"}`}
                >
                  Pix
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroMetodo("boleto")}
                  className={`px-2 py-1 text-xs rounded ${filtroMetodo === "boleto" ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground"}`}
                >
                  Boleto
                </button>
              </div>
            </div>
          </div>

          {/* Tabela de Histórico */}
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 border-b text-muted-foreground font-medium">
                <tr>
                  <th className="p-2.5">Data</th>
                  <th className="p-2.5">Descrição</th>
                  <th className="p-2.5">Meio</th>
                  <th className="p-2.5">Categoria</th>
                  <th className="p-2.5">Valor</th>
                  <th className="p-2.5">Situação</th>
                  <th className="p-2.5">Ref. Divipay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      Carregando dados financeiros...
                    </td>
                  </tr>
                ) : historicoFiltrado.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      Nenhuma movimentação financeira encontrada com os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  historicoFiltrado.map((item) => (
                    <tr key={item.id} className="hover:bg-muted/20">
                      <td className="p-2.5 font-mono text-[11px]">{item.data}</td>
                      <td className="p-2.5 font-medium text-foreground">
                        {item.descricao}
                        {item.origemEvidencia && (
                          <div className="text-[10px] text-muted-foreground">Evidência: {item.origemEvidencia}</div>
                        )}
                      </td>
                      <td className="p-2.5">
                        {item.metodoPagamento === "boleto" ? (
                          <Badge variant="outline" className="border-amber-500/30 text-amber-400 bg-amber-500/10 text-[10px] px-1.5 py-0.5">
                            Boleto
                          </Badge>
                        ) : item.metodoPagamento === "pix" ? (
                          <Badge variant="outline" className="border-sky-500/30 text-sky-400 bg-sky-500/10 text-[10px] px-1.5 py-0.5">
                            Pix
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
                            {item.metodoPagamento}
                          </Badge>
                        )}
                      </td>
                      <td className="p-2.5 text-muted-foreground">{item.categoriaNome}</td>
                      <td className="p-2.5 font-semibold text-foreground whitespace-nowrap">
                        R$ {item.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2.5">
                        {item.status === "pago" ? (
                          <span className="text-emerald-400 font-medium flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Pago
                          </span>
                        ) : (
                          <span className="text-amber-400 font-medium flex items-center gap-1">
                            <Clock className="h-3 w-3" /> Aberto
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 font-mono text-[10px] text-muted-foreground">
                        {item.divipayExternalId ? (
                          <span title={item.divipayExternalId} className="cursor-help">
                            {item.divipayExternalId.slice(0, 10)}...
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
