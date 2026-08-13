import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { useColaboradores } from "@/domains/finance/hooks/useColaboradores";
import { useColaboradorCustos } from "@/domains/finance/hooks/useColaboradorCustos";
import { useColaboradorPresencas } from "@/domains/finance/hooks/useColaboradorPresencas";
import { useColaboradorCalculos } from "@/domains/finance/hooks/useColaboradorCalculos";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/shared/components/ui/accordion";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { Progress } from "@/shared/components/ui/progress";
import { ArrowLeft, Plus, Wallet, Pencil } from "lucide-react";

import AcertoSemanal from "@/domains/finance/components/AcertoSemanal";

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function EquipeDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [mesRef, setMesRef] = useState(() => {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  });

  const { data: todos } = useColaboradores();
  const colaborador = todos?.find(c => c.id === id) || null;
  const { data: custos } = useColaboradorCustos(id || null, mesRef);
  const { data: presencas } = useColaboradorPresencas(id || null, mesRef);
  const calc = useColaboradorCalculos(colaborador, custos ?? [], presencas ?? []);

  if (!colaborador) {
    return (
      <DashboardLayout>
        <div className="p-8 text-center text-muted-foreground">Colaborador não encontrado.</div>
      </DashboardLayout>
    );
  }

  const isSocio = colaborador.tipo === "socio";
  const isFolguista = colaborador.tipo === "folguista";

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/equipe")}><ArrowLeft className="h-5 w-5" /></Button>
          <Avatar className="h-16 w-16 border border-border/50 shrink-0">
            <AvatarImage src={colaborador.foto_url || undefined} className="object-cover" style={{ objectPosition: colaborador.foto_posicao || "50% 15%" }} />
            <AvatarFallback className="bg-primary/20 text-primary text-xl font-bold">
              {colaborador.nome.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-foreground truncate">{colaborador.nome}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className={isSocio ? "border-purple-500/30 text-purple-400" : "border-blue-500/30 text-blue-400"}>
                {isSocio ? "Sócio" : "Funcionário"}
              </Badge>
              <span className="text-sm text-muted-foreground">{colaborador.cargo}</span>
              {colaborador.status === "experiencia" && (
                <Badge className="bg-amber-500/20 text-amber-400">Em experiência</Badge>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate(`/equipe/${id}/editar`)}>
            <Pencil className="h-4 w-4 mr-2" /> Editar
          </Button>
        </div>

        {!isSocio && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="bg-card/60 border-border/40">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Custo Real Mensal</p>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(calc.custoRealMensal)}</p>
                <p className="text-xs text-muted-foreground">vs salário: {formatCurrency(calc.salarioBruto)}</p>
              </CardContent>
            </Card>
            <Card className="bg-card/60 border-border/40">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Custo por Dia</p>
                <p className="text-2xl font-bold text-emerald-400">{formatCurrency(calc.custoPorDia)}</p>
                <p className="text-xs text-muted-foreground">{calc.diasTrabalhados} dias trabalhados</p>
              </CardContent>
            </Card>
            <Card className="bg-card/60 border-border/40">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Reserva Rescisão</p>
                <p className="text-2xl font-bold text-red-400">{formatCurrency(calc.reservaRescisao)}</p>
                <p className="text-xs text-muted-foreground">Custo para demitir HOJE</p>
              </CardContent>
            </Card>
          </div>
        )}

        {isSocio && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="bg-card/60 border-border/40">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Pró-labore Mensal</p>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(calc.salarioBruto)}</p>
              </CardContent>
            </Card>
            <Card className="bg-card/60 border-border/40">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Retirada Total</p>
                <p className="text-2xl font-bold text-purple-400">{formatCurrency(calc.custoRealMensal)}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {isFolguista && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="bg-card/60 border-border/40">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Valor Fixo Mensal</p>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(calc.salarioBruto)}</p>
              </CardContent>
            </Card>
            <Card className="bg-card/60 border-border/40">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Valor por Dia</p>
                <p className="text-2xl font-bold text-sky-400">{formatCurrency(calc.custoPorDia)}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {!isSocio && !isFolguista && (
          <Accordion type="multiple" defaultValue={["custos", "provisoes"]} className="space-y-2">
            <AccordionItem value="custos" className="border-border/40 bg-card/60 rounded-lg px-4">
              <AccordionTrigger className="text-foreground hover:no-underline">
                <span className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                  Custos do Mês ({formatCurrency(calc.custosVariaveis)} em variáveis)
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 pb-4">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Salário Bruto</span><span className="text-foreground">{formatCurrency(calc.salarioBruto)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Vale Transporte</span><span className="text-foreground">{formatCurrency(calc.valeTransporte)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Vale Refeição</span><span className="text-foreground">{formatCurrency(calc.valeRefeicao)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Outros Benefícios</span><span className="text-foreground">{formatCurrency(calc.outrosBeneficios)}</span></div>
                  {custos && custos.length > 0 && (
                    <div className="border-t border-border/30 pt-2 mt-2">
                      <p className="text-xs text-muted-foreground mb-2">Custos Variáveis Lançados:</p>
                      {custos.map(c => (
                        <div key={c.id} className="flex justify-between text-sm py-1">
                          <span className="text-muted-foreground">{c.tipo} {c.descricao ? `(${c.descricao})` : ""}</span>
                          <span className={c.tipo === "desconto" ? "text-red-400" : "text-foreground"}>{formatCurrency(c.valor)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="border-t border-border/30 pt-2 mt-2 flex justify-between font-medium">
                    <span className="text-foreground">Total Variável</span>
                    <span className="text-emerald-400">{formatCurrency(calc.custosVariaveis)}</span>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="provisoes" className="border-border/40 bg-card/60 rounded-lg px-4">
              <AccordionTrigger className="text-foreground hover:no-underline">
                <span className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                  Provisões Trabalhistas (Passivo Oculto)
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 pb-4">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">INSS Patronal (20%)</span><span className="text-foreground">{formatCurrency(calc.inssEmpresa)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">FGTS (8%)</span><span className="text-foreground">{formatCurrency(calc.fgts)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">13º Provisão (1/12)</span><span className="text-foreground">{formatCurrency(calc.decimoTerceiroProvisao)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Férias + 1/3 Provisão (1/12)</span><span className="text-foreground">{formatCurrency(calc.feriasProvisao)}</span></div>
                  <div className="border-t border-border/30 pt-2 mt-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Custo se assinar carteira</span>
                      <span className="text-amber-400 font-medium">{formatCurrency(calc.custoSeAssinarCarteira)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Diferença: +{formatCurrency(calc.custoSeAssinarCarteira - calc.salarioBruto)} em relação ao salário bruto
                    </p>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="rescisao" className="border-border/40 bg-card/60 rounded-lg px-4">
              <AccordionTrigger className="text-foreground hover:no-underline">
                <span className="flex items-center gap-2 text-red-400">
                  <Wallet className="h-4 w-4" />
                  Reserva para Rescisão ({formatCurrency(calc.reservaRescisao)})
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 pb-4">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">FGTS Acumulado</span><span className="text-foreground">{formatCurrency(calc.fgts * (calc.diasTrabalhados > 0 ? Math.max(1, Math.floor(calc.diasTrabalhados / 30)) : 1))}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Multa FGTS (40%)</span><span className="text-foreground">{formatCurrency(calc.multaFgtsRescisao)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Aviso Prévio (1 salário)</span><span className="text-foreground">{formatCurrency(calc.salarioBruto)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Férias Vencidas Proporcional</span><span className="text-foreground">{formatCurrency(calc.feriasProvisao * (calc.diasTrabalhados > 0 ? Math.max(1, Math.floor(calc.diasTrabalhados / 30)) : 1))}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">13º Vencido Proporcional</span><span className="text-foreground">{formatCurrency(calc.decimoTerceiroProvisao * (calc.diasTrabalhados > 0 ? Math.max(1, Math.floor(calc.diasTrabalhados / 30)) : 1))}</span></div>
                  <div className="border-t border-border/30 pt-2 mt-2 flex justify-between font-medium">
                    <span className="text-red-400">TOTAL RESERVA</span>
                    <span className="text-red-400">{formatCurrency(calc.reservaRescisao)}</span>
                  </div>
                  <p className="text-xs text-red-400/70 mt-2">
                    ⚠️ Esse é o valor que você precisa ter guardado HOJE se for demitir este colaborador.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="presenca" className="border-border/40 bg-card/60 rounded-lg px-4">
              <AccordionTrigger className="text-foreground hover:no-underline">
                <span className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                  Presença ({calc.diasTrabalhados} dias · {calc.diasFaltas} faltas)
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 pb-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted-foreground">Taxa de Presença</span>
                    <span className={calc.percentualFaltas > 10 ? "text-red-400" : "text-emerald-400"}>{(100 - calc.percentualFaltas).toFixed(0)}%</span>
                  </div>
                  <Progress value={100 - calc.percentualFaltas} className="h-2" />
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <div className="text-center p-2 bg-emerald-500/10 rounded-lg">
                      <p className="text-lg font-bold text-emerald-400">{calc.diasTrabalhados}</p>
                      <p className="text-xs text-muted-foreground">Presente</p>
                    </div>
                    <div className="text-center p-2 bg-red-500/10 rounded-lg">
                      <p className="text-lg font-bold text-red-400">{calc.diasFaltas}</p>
                      <p className="text-xs text-muted-foreground">Faltas</p>
                    </div>
                    <div className="text-center p-2 bg-amber-500/10 rounded-lg">
                      <p className="text-lg font-bold text-amber-400">{calc.diasAtrasos}</p>
                      <p className="text-xs text-muted-foreground">Atrasos</p>
                    </div>
                  </div>
                  {calc.diasFaltas > 0 && (
                    <p className="text-xs text-red-400 mt-2">
                      💸 Custo das faltas: {formatCurrency(calc.diasFaltas * calc.custoPorDia)} (salário pago + folguista)
                    </p>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        {!isSocio && calc.diasParaFimExperiencia !== null && calc.diasParaFimExperiencia <= 15 && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <p className="text-sm text-amber-400 font-medium">
              ⚡ ATENÇÃO: Faltam {calc.diasParaFimExperiencia} dias para o fim do contrato de experiência de {colaborador.nome}.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Decida: efetivar (custo sobe para {formatCurrency(calc.custoSeAssinarCarteira)}) ou dispensar (custo: {formatCurrency(calc.reservaRescisao)}).
            </p>
          </div>
        )}

        {!isSocio && !isFolguista && (
          <AcertoSemanal
            colaboradorId={colaborador.id}
            colaboradorNome={colaborador.nome}
            salarioBruto={colaborador.salario_bruto}
          />
        )}

        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => navigate(`/equipe/${id}/custo/novo`)}><Plus className="h-4 w-4 mr-1" /> Lançar Vale/Adiantamento</Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
