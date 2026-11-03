import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Banknote,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  DollarSign,
  ExternalLink,
  Pencil,
  Plus,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { useWorkspace } from "@/contexts/WorkspaceContext";
import { AcertoPaymentDialog } from "@/domains/finance/components/equipe/AcertoPaymentDialog";
import { AcertoSemanalFolguista } from "@/domains/finance/components/equipe/AcertoSemanalFolguista";
import { AcertoSemanalFuncionario } from "@/domains/finance/components/equipe/AcertoSemanalFuncionario";
import { EmployeeCostBreakdown } from "@/domains/finance/components/equipe/EmployeeCostBreakdown";
import { RegistrarPagamentoRealizadoModal } from "@/domains/finance/components/equipe/RegistrarPagamentoRealizadoModal";
import { SensitiveValue } from "@/domains/finance/components/equipe/SensitiveValue";
import { SettlementStatusBadge } from "@/domains/finance/components/equipe/SettlementStatusBadge";
import { TerminationSimulator } from "@/domains/finance/components/equipe/TerminationSimulator";
import { useColaboradorCalculos } from "@/domains/finance/hooks/useColaboradorCalculos";
import { useColaboradorCustos } from "@/domains/finance/hooks/useColaboradorCustos";
import { useColaboradorPresencas } from "@/domains/finance/hooks/useColaboradorPresencas";
import { useColaboradores } from "@/domains/finance/hooks/useColaboradores";
import { type EquipeAcerto, useEquipeAcertos } from "@/domains/finance/hooks/useEquipeAcertos";
import { decimalParaCentavos } from "@/domains/finance/services/equipeCalculations";
import { maskBankAccount, maskCpf, maskPixKey } from "@/domains/finance/services/equipePrivacy";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const labels = { socio: "Sócio", funcionario: "Funcionário", folguista: "Folguista" } as const;

function formatDate(value: string | null | undefined): string {
  if (!value) return "Não informado";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Não informado";
  try {
    const d = new Date(value);
    return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return formatDate(value);
  }
}

function genericMask(value: string | null | undefined, visible = 4): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "Não informado";
  return `${"*".repeat(Math.max(4, trimmed.length - visible))}${trimmed.slice(-visible)}`;
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "text-primary",
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Banknote;
  tone?: string;
}) {
  return (
    <Card className="border-border/50 bg-card/70">
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={`mt-2 text-xl font-bold ${tone}`}>{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <Icon className={`h-5 w-5 ${tone}`} />
      </CardContent>
    </Card>
  );
}

const origemPagamentoLabels: Record<string, string> = {
  wallet_divipay: "Wallet Pix (Divipay)",
  divipay_externo: "Saque / Transferência externa Divipay",
  manual: "Transferência bancária manual",
};

export default function EquipeDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "overview";

  const { activeWorkspace } = useWorkspace();
  const monthRef = new Date().toISOString().slice(0, 7);
  const { data: colaboradores, isLoading, refetch: refetchColaboradores } = useColaboradores();
  const colaborador = colaboradores?.find((item) => item.id === id) ?? null;
  const { data: custos = [] } = useColaboradorCustos(id || null, monthRef);
  const { data: presencas = [] } = useColaboradorPresencas(id || null, monthRef);
  const acertosQuery = useEquipeAcertos(id || null);

  const calc = useColaboradorCalculos(
    colaborador,
    custos,
    presencas,
    monthRef,
    activeWorkspace?.regime_encargos ?? "geral"
  );

  const [paymentAcerto, setPaymentAcerto] = useState<EquipeAcerto | null>(null);
  const [manualAcerto, setManualAcerto] = useState<EquipeAcerto | null>(null);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [highlightedAcertoId, setHighlightedAcertoId] = useState<string | null>(null);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && tab !== activeTab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-6xl p-6">
          <div className="h-72 animate-pulse rounded-2xl bg-muted/30" />
        </div>
      </DashboardLayout>
    );
  }

  if (!colaborador) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-3xl p-10 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="mt-3 text-lg font-semibold">Perfil não encontrado ou sem permissão</h1>
          <Button className="mt-4" variant="outline" onClick={() => navigate("/equipe")}>
            Voltar para Equipe
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const isSocio = colaborador.tipo === "socio";
  const isFolguista = colaborador.tipo === "folguista";
  const isFuncionario = colaborador.tipo === "funcionario";
  const acertos = acertosQuery.data ?? [];
  const primaryAmount = isSocio
    ? Number(colaborador.valor_pro_labore) || Number(colaborador.salario_bruto)
    : isFolguista
    ? Number(colaborador.valor_diaria) || 0
    : Number(colaborador.salario_bruto) || 0;

  // Callback após gerar acerto semanal
  const handleAcertoGeradoSuccess = (novoAcertoId?: string) => {
    acertosQuery.refetch();
    setActiveTab("settlements");
    if (novoAcertoId) {
      setHighlightedAcertoId(novoAcertoId);
    }
  };

  const highlightedAcerto = highlightedAcertoId
    ? acertos.find((a) => a.id === highlightedAcertoId)
    : null;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
        <header className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-card via-card to-primary/5 p-5">
          <div className="absolute -right-16 -top-20 h-52 w-52 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
            <Button
              aria-label="Voltar"
              variant="ghost"
              size="icon"
              onClick={() => navigate("/equipe")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Avatar className="h-16 w-16 border border-border/70">
              <AvatarImage
                src={colaborador.foto_url || undefined}
                className="object-cover"
                style={{ objectPosition: colaborador.foto_posicao || "50% 15%" }}
              />
              <AvatarFallback className="bg-primary/15 text-xl font-bold text-primary">
                {colaborador.nome
                  .split(" ")
                  .map((name) => name[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-bold">{colaborador.nome}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline">{labels[colaborador.tipo]}</Badge>
                <span className="text-sm text-muted-foreground">
                  {colaborador.cargo || "Cargo não informado"}
                </span>
                {isFuncionario && calc.estadoContrato?.estado === "indeterminado" && (
                  <Badge className="bg-emerald-500/15 text-emerald-300">
                    Prazo indeterminado
                  </Badge>
                )}
                {isFuncionario && calc.estadoContrato?.estado === "experiencia" && (
                  <Badge className="bg-amber-500/15 text-amber-300">Em experiência</Badge>
                )}
                {isFuncionario && calc.estadoContrato?.estado === "decisao" && (
                  <Badge className="bg-rose-500/15 text-rose-300">Decisão de experiência</Badge>
                )}
              </div>
            </div>
            <Button variant="outline" onClick={() => navigate(`/equipe/${id}/editar`)}>
              <Pencil className="mr-2 h-4 w-4" />
              Editar perfil
            </Button>
          </div>
        </header>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
          <div className="overflow-x-auto">
            <TabsList className="h-auto min-w-max justify-start bg-muted/30 p-1">
              <TabsTrigger value="overview" onClick={() => setActiveTab("overview")}>
                Visão geral
              </TabsTrigger>
              <TabsTrigger value="settlements" onClick={() => setActiveTab("settlements")}>
                Acertos
              </TabsTrigger>
              <TabsTrigger value="schedules" onClick={() => setActiveTab("schedules")}>
                Escalas
              </TabsTrigger>
              <TabsTrigger value="finance" onClick={() => setActiveTab("finance")}>
                Financeiro
              </TabsTrigger>
              <TabsTrigger value="personal" onClick={() => setActiveTab("personal")}>
                Dados pessoais
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ABA VISÃO GERAL */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <MetricCard
                label={isSocio ? "Pró-labore" : isFolguista ? "Diária combinada" : "Salário base"}
                value={money.format(primaryAmount)}
                detail={
                  isSocio
                    ? `Pagamento dia ${colaborador.dia_pagamento || 16}`
                    : isFolguista
                    ? "Sem encargos automáticos"
                    : "Vencimento no 5º dia útil"
                }
                icon={Banknote}
              />
              <MetricCard
                label="Custo estimado"
                value={money.format(calc.custoRealMensal)}
                detail="Mesma regra usada no painel"
                icon={CircleDollarSign}
                tone="text-emerald-400"
              />
              <MetricCard
                label="Custo por dia"
                value={money.format(calc.custoPorDia)}
                detail={
                  isFolguista ? "Valor por escala" : `${calc.diasUteisMes} dias de referência`
                }
                icon={Clock3}
                tone="text-sky-400"
              />
            </div>

            {calc.estadoContrato?.estado === "experiencia" &&
              calc.diasParaFimExperiencia !== null &&
              calc.diasParaFimExperiencia <= 15 && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
                  <strong>Contrato de experiência:</strong> faltam {calc.diasParaFimExperiencia} dias
                  para a decisão.
                </div>
              )}

            <Card className="border-border/50 bg-card/70">
              <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Admissão</p>
                  <p className="mt-1 font-medium">
                    {colaborador.data_admissao
                      ? formatDate(colaborador.data_admissao)
                      : "Não informada"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="mt-1 font-medium capitalize">
                    {isFuncionario && calc.estadoContrato?.estado === "indeterminado"
                      ? "Prazo indeterminado"
                      : colaborador.status || "Ativo"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Chave Pix</p>
                  <p
                    className={
                      colaborador.pix_chave ? "mt-1 text-emerald-400" : "mt-1 text-amber-400"
                    }
                  >
                    {colaborador.pix_chave
                      ? "Cadastrado e protegido"
                      : "Chave Pix não cadastrada (complete o perfil)"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Obrigações abertas</p>
                  <p className="mt-1 font-medium">
                    {
                      acertos.filter((item) =>
                        ["pendente", "processando", "falhou"].includes(item.status)
                      ).length
                    }
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ABA ACERTOS & HISTÓRICO FINANCEIRO */}
          <TabsContent value="settlements" className="space-y-4">
            {/* Banner de Destaque para Acerto Recém-Criado */}
            {highlightedAcerto && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                  <div>
                    <p className="font-semibold text-emerald-300">
                      Acerto semanal gerado com sucesso!
                    </p>
                    <p className="text-xs text-emerald-200/80">
                      Período {formatDate(highlightedAcerto.periodo_inicio)} a{" "}
                      {formatDate(highlightedAcerto.periodo_fim)} · Total:{" "}
                      <strong>{money.format(Number(highlightedAcerto.valor_total))}</strong>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {["pendente", "falhou"].includes(highlightedAcerto.status) && (
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-sm"
                      onClick={() => setPaymentAcerto(highlightedAcerto)}
                    >
                      Revisar e pagar agora
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setHighlightedAcertoId(null)}
                    className="text-xs"
                  >
                    Dispensar
                  </Button>
                </div>
              </div>
            )}

            {acertos.length === 0 ? (
              <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
                Nenhum acerto gerado.
              </div>
            ) : (
              acertos.map((acerto) => {
                const isHighlighted = acerto.id === highlightedAcertoId;
                const pagamentoConfirmado = acerto.colaborador_pagamentos?.find(
                  (p) => p.status === "pago"
                );

                return (
                  <Card
                    key={acerto.id}
                    className={`border-border/50 bg-card/70 transition-all ${
                      isHighlighted ? "border-emerald-500/60 shadow-lg ring-1 ring-emerald-500/30" : ""
                    }`}
                  >
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-foreground">
                              {formatDate(acerto.periodo_inicio)} a {formatDate(acerto.periodo_fim)}
                            </p>
                            <SettlementStatusBadge status={acerto.status} />
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Vencimento da obrigação: {formatDate(acerto.vencimento)}
                          </p>
                        </div>
                        <p className="text-xl font-bold text-primary">
                          {money.format(Number(acerto.valor_total))}
                        </p>
                      </div>

                      {/* Itens do Acerto */}
                      <div className="my-4 space-y-2 border-y border-border/40 py-3">
                        {acerto.colaborador_acerto_itens.map((item) => (
                          <div className="flex justify-between gap-3 text-sm" key={item.id}>
                            <span className="text-muted-foreground">{item.descricao}</span>
                            <span className="font-medium text-foreground">
                              {money.format(Number(item.valor))}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Dados de Quitação Efetiva quando Pago */}
                      {acerto.status === "pago" && pagamentoConfirmado && (
                        <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200 space-y-1">
                          <p className="font-semibold text-emerald-300">
                            Pagamento quitado com sucesso
                          </p>
                          <p>
                            Data do pagamento:{" "}
                            <strong>
                              {formatDateTime(
                                pagamentoConfirmado.paid_at || pagamentoConfirmado.created_at
                              )}
                            </strong>
                          </p>
                          <p>
                            Origem:{" "}
                            <strong>
                              {origemPagamentoLabels[pagamentoConfirmado.origem] ||
                                pagamentoConfirmado.origem}
                            </strong>
                          </p>
                          {pagamentoConfirmado.divipay_external_id && (
                            <p>
                              ID externo: <code>{pagamentoConfirmado.divipay_external_id}</code>
                            </p>
                          )}
                          {pagamentoConfirmado.comprovante_url && (
                            <a
                              href={pagamentoConfirmado.comprovante_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-primary underline"
                            >
                              Ver comprovante <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      )}

                      {/* Ações para Acertos Pendentes */}
                      {["pendente", "falhou"].includes(acerto.status) && (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <Button
                            className="w-full sm:w-auto"
                            onClick={() => setPaymentAcerto(acerto)}
                          >
                            Revisar e pagar (Pix)
                          </Button>
                          <Button
                            variant="outline"
                            className="w-full sm:w-auto border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                            onClick={() => setManualAcerto(acerto)}
                          >
                            <DollarSign className="mr-1.5 h-4 w-4" />
                            Registrar pagamento manual / externo
                          </Button>
                        </div>
                      )}

                      {acerto.status === "processando" && (
                        <p className="text-sm text-sky-400">Aguardando confirmação do Divipay.</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          {/* ABA ESCALAS & ACERTO SEMANAL */}
          <TabsContent value="schedules" className="space-y-4">
            {isSocio ? (
              <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
                Sócios não usam escala semanal.
              </div>
            ) : isFolguista ? (
              <AcertoSemanalFolguista
                colaboradorId={colaborador.id}
                colaboradorNome={colaborador.nome}
                valorDiaria={Number(colaborador.valor_diaria) || 100}
                onSuccess={handleAcertoGeradoSuccess}
              />
            ) : (
              <AcertoSemanalFuncionario
                colaboradorId={colaborador.id}
                colaboradorNome={colaborador.nome}
                valorPassagem={Number(colaborador.valor_passagem) || 6.25}
                pixChave={colaborador.pix_chave}
                pixTipo={colaborador.pix_tipo}
                onSuccess={handleAcertoGeradoSuccess}
              />
            )}
          </TabsContent>

          {/* ABA FINANCEIRO */}
          <TabsContent value="finance" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Base mensal"
                value={money.format(primaryAmount)}
                detail={labels[colaborador.tipo]}
                icon={BriefcaseBusiness}
              />
              <MetricCard
                label="Transporte"
                value={money.format(calc.valeTransporte)}
                detail="Acertos agrupados"
                icon={CalendarDays}
                tone="text-sky-400"
              />
              <MetricCard
                label="Benefícios"
                value={money.format(calc.valeRefeicao + calc.outrosBeneficios)}
                detail="Refeição e outros"
                icon={Plus}
                tone="text-violet-400"
              />
              <MetricCard
                label="Total estimado"
                value={money.format(calc.custoRealMensal)}
                detail="Sem taxa Divipay"
                icon={CircleDollarSign}
                tone="text-emerald-400"
              />
            </div>

            {isFuncionario && (
              <>
                <EmployeeCostBreakdown
                  salarioCentavos={decimalParaCentavos(colaborador.salario_bruto || 0)}
                  inssEmpresaCentavos={decimalParaCentavos(calc.inssEmpresa)}
                  fgtsCentavos={decimalParaCentavos(calc.fgts)}
                  decimoTerceiroCentavos={decimalParaCentavos(calc.decimoTerceiroProvisao)}
                  feriasCentavos={decimalParaCentavos(calc.feriasProvisao)}
                  pisoCategoriaCentavos={
                    activeWorkspace?.piso_categoria
                      ? decimalParaCentavos(activeWorkspace.piso_categoria)
                      : null
                  }
                  convencaoMte={activeWorkspace?.convencao_mte}
                  fonteUrl={activeWorkspace?.convencao_fonte_url}
                />
                {calc.estadoContrato?.estado === "indeterminado" && (
                  <TerminationSimulator
                    dataAdmissao={
                      colaborador.data_admissao || new Date().toISOString().slice(0, 10)
                    }
                    salarioCentavos={decimalParaCentavos(colaborador.salario_bruto || 0)}
                    fgtsHistoricoEstimadoCentavos={decimalParaCentavos(calc.fgts * 10)}
                  />
                )}
              </>
            )}

            <Button onClick={() => navigate(`/equipe/${id}/custo/novo`)}>
              <Plus className="mr-2 h-4 w-4" />
              Lançar vale ou ajuste
            </Button>
          </TabsContent>

          {/* ABA DADOS PESSOAIS */}
          <TabsContent value="personal" className="space-y-4">
            <Card className="border-border/50 bg-card/70">
              <CardContent className="p-5">
                <div className="mb-4 flex items-center gap-2">
                  <UserRound className="h-5 w-5 text-primary" />
                  <h2 className="font-semibold">Dados pessoais protegidos</h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <SensitiveValue
                    label="CPF"
                    value={colaborador.cpf}
                    maskedValue={maskCpf(colaborador.cpf)}
                  />
                  <SensitiveValue
                    label="RG"
                    value={colaborador.rg}
                    maskedValue={genericMask(colaborador.rg, 3)}
                  />
                  <SensitiveValue
                    label="Telefone"
                    value={colaborador.telefone}
                    maskedValue={genericMask(colaborador.telefone, 4)}
                  />
                  <SensitiveValue
                    label="Endereço"
                    value={colaborador.endereco}
                    maskedValue="•••• endereço protegido"
                  />
                  <SensitiveValue
                    label="Contato de emergência 1"
                    value={colaborador.contato_emergencia_1}
                    maskedValue={genericMask(colaborador.contato_emergencia_1, 4)}
                  />
                  <SensitiveValue
                    label="Contato de emergência 2"
                    value={colaborador.contato_emergencia_2}
                    maskedValue={genericMask(colaborador.contato_emergencia_2, 4)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/70">
              <CardContent className="p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Banknote className="h-5 w-5 text-emerald-400" />
                  <h2 className="font-semibold">Pagamento e dados bancários</h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <SensitiveValue
                    label="Chave Pix"
                    value={colaborador.pix_chave}
                    maskedValue={maskPixKey(
                      colaborador.pix_chave,
                      colaborador.pix_tipo || "aleatoria"
                    )}
                  />
                  <SensitiveValue
                    label="Conta bancária"
                    value={colaborador.banco_conta}
                    maskedValue={maskBankAccount(colaborador.banco_conta)}
                  />
                  <SensitiveValue
                    label="Agência bancária"
                    value={colaborador.banco_agencia}
                    maskedValue={genericMask(colaborador.banco_agencia, 2)}
                  />
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  {colaborador.banco_nome || "Banco não informado"}
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {paymentAcerto && (
        <AcertoPaymentDialog
          open={Boolean(paymentAcerto)}
          onOpenChange={(open) => {
            if (!open) setPaymentAcerto(null);
          }}
          acerto={paymentAcerto}
          colaboradorNome={colaborador.nome}
          pixTipo={colaborador.pix_tipo || undefined}
        />
      )}

      {manualAcerto && (
        <RegistrarPagamentoRealizadoModal
          open={Boolean(manualAcerto)}
          onOpenChange={(open) => {
            if (!open) setManualAcerto(null);
          }}
          colaboradores={colaboradores || []}
          defaultColaboradorId={colaborador.id}
          defaultAcertoId={manualAcerto.id}
          defaultTipo={manualAcerto.tipo}
          defaultValor={Number(manualAcerto.valor_total)}
          defaultDataPagamento={manualAcerto.vencimento}
          onSuccess={() => {
            acertosQuery.refetch();
            refetchColaboradores();
          }}
        />
      )}
    </DashboardLayout>
  );
}
