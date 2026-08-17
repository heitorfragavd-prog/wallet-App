import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EquipeAcerto } from "@/domains/finance/hooks/useEquipeAcertos";
import { AcertoPaymentDialog } from "./AcertoPaymentDialog";

const mocks = vi.hoisted(() => ({
  iniciar: vi.fn(),
  falhar: vi.fn(),
  withdraw: vi.fn(),
}));

vi.mock("@/domains/finance/hooks/useEquipeAcertos", () => ({
  useEquipeAcertos: () => ({
    iniciarPagamento: { mutateAsync: mocks.iniciar, isPending: false },
    registrarFalha: { mutateAsync: mocks.falhar, isPending: false },
  }),
}));

vi.mock("@/domains/divipay/services/DivipayService", () => ({
  divipayService: { createWithdraw: mocks.withdraw },
}));

const acerto: EquipeAcerto = {
  id: "acerto-1",
  workspace_id: "workspace-1",
  colaborador_id: "colaborador-1",
  tipo: "semanal_funcionario",
  periodo_inicio: "2026-08-17",
  periodo_fim: "2026-08-23",
  vencimento: "2026-08-24",
  status: "pendente",
  valor_total: 109.5,
  pix_chave_snapshot: "123.456.789-00",
  despesa_id: "despesa-1",
  created_at: "2026-08-23T12:00:00Z",
  updated_at: "2026-08-23T12:00:00Z",
  colaborador_acerto_itens: [
    {
      id: "item-transporte",
      acerto_id: "acerto-1",
      workspace_id: "workspace-1",
      natureza: "transporte",
      descricao: "Transporte semanal",
      valor: 89.5,
      created_at: "2026-08-23T12:00:00Z",
    },
    {
      id: "item-meta",
      acerto_id: "acerto-1",
      workspace_id: "workspace-1",
      natureza: "meta",
      descricao: "Metas da semana",
      valor: 20,
      created_at: "2026-08-23T12:00:00Z",
    },
  ],
  colaborador_pagamentos: [],
};

describe("AcertoPaymentDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.iniciar.mockResolvedValue({
      pagamento_id: "pagamento-1",
      idempotency_key: "equipe:acerto-1:001",
      status: "processando",
    });
    mocks.withdraw.mockResolvedValue({ transacao: { id: "tx-1" }, withdraw: {} });
    mocks.falhar.mockResolvedValue("pagamento-1");
  });

  it("mostra composição, total e Pix mascarado e exige confirmação", async () => {
    render(
      <AcertoPaymentDialog
        open
        onOpenChange={vi.fn()}
        acerto={acerto}
        colaboradorNome="Shuellen Pereira Santos"
        pixTipo="cpf"
      />,
    );

    expect(screen.getByText("Shuellen Pereira Santos")).toBeInTheDocument();
    expect(screen.getByText("17/08/2026 a 23/08/2026")).toBeInTheDocument();
    expect(screen.getByText("Transporte semanal")).toBeInTheDocument();
    expect(screen.getByText("Metas da semana")).toBeInTheDocument();
    expect(screen.getByText("R$ 109,50")).toBeInTheDocument();
    expect(screen.getByText("***.456.789-**")).toBeInTheDocument();

    const submit = screen.getByRole("button", { name: /enviar pagamento/i });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: /confirmei os dados/i }));
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(mocks.iniciar).toHaveBeenCalledWith({
      acertoId: "acerto-1",
      origem: "wallet_divipay",
    }));
    expect(mocks.withdraw).toHaveBeenCalledWith(expect.objectContaining({
      amount: 109.5,
      keyPix: "123.456.789-00",
      metadata: {
        acerto_id: "acerto-1",
        pagamento_id: "pagamento-1",
        workspace_id: "workspace-1",
        idempotency_key: "equipe:acerto-1:001",
      },
    }));
    expect(await screen.findByText(/aguardando confirmação do Divipay/i)).toBeInTheDocument();
  });

  it("desabilita pagamento quando o acerto não possui Pix", () => {
    render(
      <AcertoPaymentDialog
        open
        onOpenChange={vi.fn()}
        acerto={{ ...acerto, pix_chave_snapshot: null }}
        colaboradorNome="Shuellen Pereira Santos"
      />,
    );

    expect(screen.getByText(/cadastre uma chave Pix/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /enviar pagamento/i })).toBeDisabled();
  });

  it("registra falha do provedor sem marcar o acerto como pago", async () => {
    mocks.withdraw.mockRejectedValueOnce(new Error("Divipay indisponível"));
    render(
      <AcertoPaymentDialog
        open
        onOpenChange={vi.fn()}
        acerto={acerto}
        colaboradorNome="Shuellen Pereira Santos"
        pixTipo="cpf"
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /confirmei os dados/i }));
    fireEvent.click(screen.getByRole("button", { name: /enviar pagamento/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Divipay indisponível");
    expect(mocks.falhar).toHaveBeenCalledWith({
      pagamentoId: "pagamento-1",
      erroCodigo: "provider_error",
    });
    expect(screen.queryByText(/pagamento confirmado/i)).not.toBeInTheDocument();
  });
});
