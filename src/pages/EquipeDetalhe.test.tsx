import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Colaborador } from "@/domains/finance/hooks/useColaboradores";
import EquipeDetalhePage from "./EquipeDetalhe";

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate, useParams: () => ({ id: "colaborador-1" }) };
});
vi.mock("@/shared/components/layouts/DashboardLayout", () => ({ DashboardLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

vi.mock("@/contexts/WorkspaceContext", () => ({
  useWorkspace: () => ({
    activeWorkspace: {
      id: "ws-1",
      user_id: "user-1",
      nome: "Conta Rodo Point",
      tipo: "PJ",
      is_default: true,
      regime_encargos: "mei",
      piso_categoria: 1681.18,
      convencao_mte: "MR009846/2026",
      convencao_fonte_url: "https://mediador.trabalho.gov.br/exemplo",
    },
  }),
}));

const colaborador: Colaborador = {
  id: "colaborador-1",
  nome: "Shuellen Pereira Santos",
  foto_url: null,
  tipo: "funcionario",
  cargo: "Atendente",
  data_admissao: "2026-02-23",
  data_demissao: null,
  salario_bruto: 1621,
  vale_transporte: 0,
  vale_refeicao: 0,
  outros_beneficios: 0,
  status: "experiencia",
  dias_experiencia: 90,
  carga_horaria_semanal: 44,
  cpf: "123.456.789-00",
  rg: "12.345.678-9",
  telefone: "11999990000",
  email: "shuellen@example.com",
  endereco: "Rua Protegida, 123",
  pix_tipo: "cpf",
  pix_chave: "123.456.789-00",
  banco_nome: "Banco Teste",
  banco_agencia: "0001",
  banco_conta: "123456-7",
  valor_passagem: 6.25,
  created_at: "2026-01-01T00:00:00Z",
};

vi.mock("@/domains/finance/hooks/useColaboradores", () => ({ useColaboradores: () => ({ data: [colaborador], isLoading: false }) }));
vi.mock("@/domains/finance/hooks/useColaboradorCustos", () => ({ useColaboradorCustos: () => ({ data: [] }) }));
vi.mock("@/domains/finance/hooks/useColaboradorPresencas", () => ({ useColaboradorPresencas: () => ({ data: [] }) }));
vi.mock("@/domains/finance/hooks/useEquipeAcertos", () => ({
  useEquipeAcertos: () => ({
    data: [{
      id: "acerto-1", workspace_id: "workspace-1", colaborador_id: "colaborador-1", tipo: "semanal_funcionario",
      periodo_inicio: "2026-08-17", periodo_fim: "2026-08-23", vencimento: "2026-08-24", status: "pendente",
      valor_total: 109.5, pix_chave_snapshot: "123.456.789-00", despesa_id: "d1", created_at: "", updated_at: "",
      colaborador_acerto_itens: [{ id: "i1", acerto_id: "acerto-1", workspace_id: "workspace-1", natureza: "transporte", descricao: "Transporte semanal", valor: 109.5, created_at: "" }],
      colaborador_pagamentos: [],
    }],
    isLoading: false,
  }),
}));
vi.mock("@/domains/finance/components/equipe/AcertoSemanalFuncionario", () => ({ AcertoSemanalFuncionario: () => <div>Editor semanal de funcionário</div> }));
vi.mock("@/domains/finance/components/equipe/AcertoSemanalFolguista", () => ({ AcertoSemanalFolguista: () => <div>Editor semanal de folguista</div> }));
vi.mock("@/domains/finance/components/equipe/AcertoPaymentDialog", () => ({ AcertoPaymentDialog: () => null }));

describe("EquipeDetalhePage", () => {
  it("organiza o perfil em abas específicas e lista o acerto pendente", () => {
    render(<EquipeDetalhePage />);
    expect(screen.getAllByText("Prazo indeterminado").length).toBeGreaterThan(0);
    expect(screen.getByRole("tab", { name: "Visão geral" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Acertos" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Escalas" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Financeiro" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Dados pessoais" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Acertos" }));
    expect(screen.getByText("Transporte semanal")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /revisar e pagar/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Financeiro" }));
    expect(screen.getAllByText(/2\.114,50/).length).toBeGreaterThan(0);
    expect(screen.getByText("Simulador de desligamento")).toBeInTheDocument();
    expect(screen.getByText(/diferença informativa de R\$\s*60,18/i)).toBeInTheDocument();
  });

  it("mascara dados sensíveis por padrão e só revela com ação explícita", () => {
    render(<EquipeDetalhePage />);
    fireEvent.click(screen.getByRole("tab", { name: "Dados pessoais" }));
    expect(screen.getAllByText("***.456.789-**")).toHaveLength(2);
    expect(screen.queryByText("123456-7")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /revelar conta bancária/i }));
    expect(screen.getByText("123456-7")).toBeInTheDocument();
  });
});
