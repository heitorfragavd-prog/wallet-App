import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Colaborador } from "@/domains/finance/hooks/useColaboradores";
import EquipePage from "./Equipe";

const navigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});
vi.mock("@/shared/components/layouts/DashboardLayout", () => ({ DashboardLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/domains/finance/hooks/useEquipeObrigacoesMensais", () => ({ useEquipeObrigacoesMensais: () => ({}) }));
vi.mock("@/domains/finance/hooks/useEquipeResumo", () => ({
  useEquipeResumo: () => ({ data: { pendentes: 3, processando: 1, pagosNoMes: 4, falhas: 0, totalPendente: 10_109.5, proximoVencimento: "2026-08-18" } }),
}));

const base: Colaborador = {
  id: "base",
  nome: "Base",
  foto_url: null,
  tipo: "funcionario",
  cargo: "Atendente",
  data_admissao: "2026-06-06",
  data_demissao: null,
  salario_bruto: 1621,
  vale_transporte: 0,
  vale_refeicao: 0,
  outros_beneficios: 0,
  status: "ativo",
  dias_experiencia: 90,
  carga_horaria_semanal: 44,
  created_at: "2026-01-01T00:00:00Z",
};

const colaboradores: Colaborador[] = [
  { ...base, id: "h", nome: "Heitor Fraga", tipo: "socio", valor_pro_labore: 5000, dia_pagamento: 16, pix_chave: "12345678900" },
  { ...base, id: "v", nome: "Viviane Teotonio", tipo: "socio", valor_pro_labore: 5000, dia_pagamento: 25, pix_chave: "viviane@example.com" },
  { ...base, id: "s", nome: "Shuellen Pereira", status: "experiencia", pix_chave: null },
  { ...base, id: "l", nome: "Luiz Fellipe", tipo: "folguista", valor_diaria: 100, salario_bruto: 0, pix_chave: "11999990000" },
];

vi.mock("@/domains/finance/hooks/useColaboradores", () => ({
  useColaboradores: () => ({ data: colaboradores, isLoading: false, error: null }),
}));

describe("EquipePage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date("2026-08-25T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("mostra resumo, contagens globais, alertas e filtros sem distorcer os totais", () => {
    render(<EquipePage />);

    expect(screen.getByText("R$ 10.109,50")).toBeInTheDocument();
    expect(screen.getByText("2 sócios · 1 funcionário · 1 folguista")).toBeInTheDocument();
    expect(screen.getByText(/Pix pendente/i)).toBeInTheDocument();
    expect(screen.getByText(/experiência termina/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /folguistas/i }));
    expect(screen.getByText("Luiz Fellipe")).toBeInTheDocument();
    expect(screen.queryByText("Shuellen Pereira")).not.toBeInTheDocument();
    expect(screen.getByText("2 sócios · 1 funcionário · 1 folguista")).toBeInTheDocument();
  });

  it("usa a mesma regra de custo do domínio no card do funcionário", () => {
    render(<EquipePage />);
    expect(screen.getByTestId("custo-s")).toHaveTextContent("R$ 2.390,07");
  });
});
