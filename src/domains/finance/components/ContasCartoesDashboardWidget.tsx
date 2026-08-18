import React, { useState } from "react";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Eye, EyeOff, Info, ArrowRight, CreditCard as CreditCardIcon } from "lucide-react";
import { useContasUsuario } from "@/domains/finance/hooks/useContasUsuario";
import { useDividas } from "@/domains/finance/hooks/useDividas";
import { useDespesas } from "@/domains/finance/hooks/useDespesas";
import { determinarFaturaParaData, calcularPeriodoFatura } from "@/domains/finance/hooks/useFaturasCartao";
import { BankLogoBadge } from "@/shared/components/BankLogoBadge";
import { FaturaCartaoModal } from "@/domains/finance/components/FaturaCartaoModal";
import { ContaUsuario } from "@/domains/finance/hooks/useContasUsuario";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { usePrivacy } from "@/contexts/PrivacyContext";

export const ContasCartoesDashboardWidget: React.FC = () => {
  const navigate = useNavigate();
  const { contas, loading, saldoConsolidado } = useContasUsuario();
  const { dividas } = useDividas();
  const { despesas } = useDespesas();
  const { isPrivate: esconderValores, togglePrivacy } = usePrivacy();
  const [cartaoFatura, setCartaoFatura] = useState<ContaUsuario | null>(null);
  const [modalFaturaAberto, setModalFaturaAberto] = useState(false);

  const contasBancarias = contas.filter((c) => c.tipo !== "cartao_credito");
  const cartoesCredito = contas.filter((c) => c.tipo === "cartao_credito");

  const mesAtualNome = format(new Date(), "MMMM", { locale: ptBR });
  const mesAtualCapitalizado = mesAtualNome.charAt(0).toUpperCase() + mesAtualNome.slice(1);

  // Calcula total das faturas atuais dos cartões (dívidas + despesas diretas da fatura atual)
  const totalFaturasCartoes = cartoesCredito.reduce((acc, cartao) => {
    const dividasDoCartao = dividas.filter((d) => d.conta_id === cartao.id && d.status !== "quitada");
    const totalDivs = dividasDoCartao.reduce((sum, d) => sum + Number(d.valor_restante), 0);

    const hojeStr = format(new Date(), "yyyy-MM-dd");
    const { mes_fatura, ano_fatura } = determinarFaturaParaData(hojeStr, cartao.dia_fechamento);
    const periodo = calcularPeriodoFatura(cartao, mes_fatura, ano_fatura);

    const despesasDoCartao = despesas.filter((d: any) => {
      const pertenceCartao =
        d.conta_id === cartao.id ||
        ((d.metodo_pagamento === "cartao_credito" || d.forma_pagamento === "cartao_credito") && (!d.conta_id || d.conta_id === cartao.id));
      if (!pertenceCartao) return false;
      return d.data > periodo.data_inicio && d.data <= periodo.data_fechamento;
    });
    const totalDesp = despesasDoCartao.reduce((sum, d) => sum + Number(d.valor), 0);
    return acc + totalDivs + totalDesp;
  }, 0);

  const formatarValor = (valor: number) => {
    if (esconderValores) return "R$ ••••••";
    return `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 my-6">
      {/* ── CARD MINHAS CONTAS ── */}
      <Card className="border border-border/60 bg-card shadow-sm hover:shadow-md transition-shadow">
        <CardContent className="p-6 space-y-5">
          {/* Header do Card: Saldo Geral */}
          <div className="flex items-center justify-between pb-4 border-b border-border/50">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-4 bg-emerald-500 rounded-full inline-block" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Saldo geral
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-2xl font-bold text-foreground">
                  {formatarValor(saldoConsolidado)}
                </span>
                <button
                  type="button"
                  onClick={togglePrivacy}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title={esconderValores ? "Mostrar valores" : "Esconder valores"}
                >
                  {esconderValores ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Título da Seção */}
          <h3 className="text-base font-semibold text-foreground">Minhas contas</h3>

          {/* Lista de Contas */}
          <div className="space-y-3.5">
            {loading ? (
              <div className="py-6 text-center text-xs text-muted-foreground">Carregando contas...</div>
            ) : contasBancarias.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                Nenhuma conta bancária cadastrada.
              </div>
            ) : (
              contasBancarias.map((conta) => {
                const saldo = Number(conta.saldo_atual) || Number(conta.saldo_inicial) || 0;
                const dividasVinculadas = dividas.filter((d) => d.conta_id === conta.id && d.status !== "quitada");
                const totalDividas = dividasVinculadas.reduce((sum, d) => sum + Number(d.valor_restante || 0), 0);

                return (
                  <div
                    key={conta.id}
                    className="p-3 rounded-xl hover:bg-muted/40 transition-colors border border-transparent hover:border-border/40 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <BankLogoBadge nomeOuId={conta.nome} size="md" />
                        <div>
                          <p className="font-medium text-sm text-foreground">{conta.nome}</p>
                          <p className="text-[11px] text-muted-foreground capitalize">
                            {conta.tipo.replace("_", " ")}
                          </p>
                        </div>
                      </div>
                      <span className="font-bold text-sm text-blue-500 dark:text-blue-400">
                        {formatarValor(saldo)}
                      </span>
                    </div>

                    {dividasVinculadas.length > 0 && (
                      <div className="flex items-center justify-between text-[11px] text-rose-500 pl-11">
                        <span className="flex items-center gap-1">
                          <CreditCardIcon className="w-3 h-3" />
                          {dividasVinculadas.length} dívida(s) vinculada(s)
                        </span>
                        <span className="font-semibold">
                          {formatarValor(totalDividas)}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Botão Gerenciar Contas */}
          <div className="pt-2">
            <Button
              variant="outline"
              onClick={() => navigate("/contas")}
              className="w-full h-10 text-sm font-medium border-border/80 hover:bg-muted/60 text-muted-foreground hover:text-foreground"
            >
              Gerenciar contas
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── CARD MEUS CARTÕES ── */}
      <Card className="border border-border/60 bg-card shadow-sm hover:shadow-md transition-shadow">
        <CardContent className="p-6 space-y-5">
          {/* Header do Card: Faturas do Mês */}
          <div className="flex items-center justify-between pb-4 border-b border-border/50">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-4 bg-emerald-500 rounded-full inline-block" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  Faturas de {mesAtualCapitalizado}
                  <Info className="w-3.5 h-3.5 text-muted-foreground/70" />
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-2xl font-bold text-foreground">
                  {formatarValor(totalFaturasCartoes)}
                </span>
                <button
                  type="button"
                  onClick={togglePrivacy}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title={esconderValores ? "Mostrar valores" : "Esconder valores"}
                >
                  {esconderValores ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Título da Seção */}
          <h3 className="text-base font-semibold text-foreground">Meus cartões</h3>

          {/* Lista de Cartões de Crédito */}
          <div className="space-y-4">
            {loading ? (
              <div className="py-6 text-center text-xs text-muted-foreground">Carregando cartões...</div>
            ) : cartoesCredito.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                Nenhum cartão de crédito cadastrado.
              </div>
            ) : (
              cartoesCredito.map((cartao) => {
                const dividasDoCartao = dividas.filter(
                  (d) => d.conta_id === cartao.id && d.status !== "quitada"
                );
                
                const hojeStr = format(new Date(), "yyyy-MM-dd");
                const { mes_fatura, ano_fatura } = determinarFaturaParaData(hojeStr, cartao.dia_fechamento);
                const periodo = calcularPeriodoFatura(cartao, mes_fatura, ano_fatura);

                const despesasDoCartao = despesas.filter((d: any) => {
                  const pertenceCartao =
                    d.conta_id === cartao.id ||
                    ((d.metodo_pagamento === "cartao_credito" || d.forma_pagamento === "cartao_credito") && (!d.conta_id || d.conta_id === cartao.id));
                  if (!pertenceCartao) return false;
                  return d.data > periodo.data_inicio && d.data <= periodo.data_fechamento;
                });
                const faturaAtual = dividasDoCartao.reduce((sum, d) => sum + Number(d.valor_restante), 0) + despesasDoCartao.reduce((sum, d) => sum + Number(d.valor), 0);
                const limiteTotal = Number(cartao.limite_credito) || 0;
                const limiteDisponivel = Math.max(0, limiteTotal - faturaAtual);

                const diaVenc = cartao.dia_vencimento ? `${cartao.dia_vencimento}/${new Date().getMonth() + 1}` : "—";

                return (
                  <div key={cartao.id} className="space-y-2.5">
                    {/* Header do Cartão */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <BankLogoBadge nomeOuId={cartao.nome} size="md" />
                        <div>
                          <p className="font-medium text-sm text-foreground">{cartao.nome}</p>
                          <p className="text-[11px] text-muted-foreground">Cartão de Crédito</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setCartaoFatura(cartao);
                          setModalFaturaAberto(true);
                        }}
                        className="h-7 text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 font-medium px-3 rounded-full"
                      >
                        Ver fatura
                      </Button>
                    </div>

                    {/* Box de Informações do Limite e Fatura */}
                    <div className="bg-muted/30 border border-border/40 rounded-xl p-3 grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-[11px] text-muted-foreground block mb-0.5">
                          Limite Disponível
                        </span>
                        <span className="font-semibold text-xs text-foreground">
                          {formatarValor(limiteDisponivel)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-muted-foreground block mb-0.5">
                          Fatura atual <span className="text-[10px]">(Venc. {diaVenc})</span>
                        </span>
                        <span className="font-semibold text-xs text-foreground">
                          {formatarValor(faturaAtual)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Botão Gerenciar Cartões */}
          <div className="pt-2">
            <Button
              variant="outline"
              onClick={() => navigate("/contas")}
              className="w-full h-10 text-sm font-medium border-border/80 hover:bg-muted/60 text-muted-foreground hover:text-foreground"
            >
              Gerenciar cartões
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Modal Fatura Organizze */}
      <FaturaCartaoModal
        cartao={cartaoFatura}
        open={modalFaturaAberto}
        onOpenChange={setModalFaturaAberto}
      />
    </div>
  );
};
