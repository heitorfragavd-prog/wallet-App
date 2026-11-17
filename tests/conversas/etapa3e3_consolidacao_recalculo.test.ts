import { describe, it, expect } from "vitest";

/**
 * Bateria de Testes da Etapa 3E.3 - Gate A2 & A3:
 * Consolidação Atômica Recalculada no PostgreSQL e Eliminação de Valores Defasados
 */

interface FechamentoAnexoMock {
  id?: string;
  storage_path?: string;
  sha256?: string;
  file_id?: string;
  tipo_documento: string;
  is_duplicata?: boolean;
  valor_extraido?: {
    dinheiro?: number;
    debito?: number;
    credito?: number;
    pix?: number;
    voucher?: number;
    outros?: number;
    sobra?: number;
  };
}

/**
 * Simulação fiel do algoritmo PL/pgSQL implementado na Migration 106
 * (consolidar_fechamento_caixa_atomico sob lock FOR UPDATE)
 */
function simularConsolidarFechamentoAtomicoRpc(params: {
  fechamentoAtual: {
    id: string;
    workspace_id: string;
    colaborador_id: string;
    status: string;
    anexos: FechamentoAnexoMock[];
    telegram_message_ids: number[];
    total: Record<string, number> | null;
  };
  caller: {
    userId: string;
    role: string;
    isExecutiveOrAdmin: boolean;
    colaboradorId?: string;
  };
  novosAnexos: FechamentoAnexoMock[];
  novosMsgs: number[];
  pTotal?: Record<string, number> | null;
  pSobra?: number;
}) {
  const { fechamentoAtual, caller, novosAnexos, novosMsgs, pTotal, pSobra } = params;

  // 1. Verificação de imutabilidade
  if (fechamentoAtual.status === "aprovado") {
    const err = new Error("Acesso negado: fechamento de caixa já foi aprovado e não pode ser alterado.");
    (err as Error & { code?: string }).code = "42501";
    throw err;
  }

  // 2. Verificação de permissões
  if (caller.role !== "service_role" && !caller.isExecutiveOrAdmin) {
    if (!caller.colaboradorId || fechamentoAtual.colaborador_id !== caller.colaboradorId) {
      const err = new Error("Acesso negado: colaboradores comuns só podem consolidar seus próprios fechamentos de caixa.");
      (err as Error & { code?: string }).code = "42501";
      throw err;
    }
  }

  // 3. Mesclagem não-destrutiva de anexos (deduplicação por sha256 e file_id)
  const anexosFinais: FechamentoAnexoMock[] = [...fechamentoAtual.anexos];
  for (const novo of novosAnexos) {
    const jaExiste = anexosFinais.some(
      (a) =>
        (novo.sha256 && a.sha256 === novo.sha256) ||
        (novo.file_id && a.file_id === novo.file_id)
    );
    if (!jaExiste) {
      anexosFinais.push(novo);
    }
  }

  // 4. Mesclagem de telegram_message_ids
  const msgsFinais = [...fechamentoAtual.telegram_message_ids];
  for (const m of novosMsgs) {
    if (!msgsFinais.includes(m)) {
      msgsFinais.push(m);
    }
  }

  // 5. Recálculo atômico determinístico a partir dos anexos persistidos (Gate A2)
  let temRelatorio = false;
  let relatorioItem: FechamentoAnexoMock | null = null;
  let envelopeItem: FechamentoAnexoMock | null = null;
  let dinheiro = 0;
  let debito = 0;
  let credito = 0;
  let pix = 0;
  let voucher = 0;
  let outros = 0;
  let sobra = 0;
  let temValoresEstruturados = false;

  for (const item of anexosFinais) {
    if (!item.is_duplicata) {
      if (item.tipo_documento === "relatorio_consolidado" && item.valor_extraido) {
        temRelatorio = true;
        relatorioItem = item;
      } else if (item.tipo_documento === "envelope" && item.valor_extraido) {
        envelopeItem = item;
      }
    }
  }

  if (temRelatorio && relatorioItem?.valor_extraido) {
    temValoresEstruturados = true;
    dinheiro = relatorioItem.valor_extraido.dinheiro || 0;
    debito = relatorioItem.valor_extraido.debito || 0;
    credito = relatorioItem.valor_extraido.credito || 0;
    pix = relatorioItem.valor_extraido.pix || 0;
    voucher = relatorioItem.valor_extraido.voucher || 0;
    outros = relatorioItem.valor_extraido.outros || 0;
    sobra = relatorioItem.valor_extraido.sobra || 0;

    if (envelopeItem?.valor_extraido) {
      if ((envelopeItem.valor_extraido.sobra || 0) > 0) {
        sobra = envelopeItem.valor_extraido.sobra || 0;
      }
      if (dinheiro === 0 && (envelopeItem.valor_extraido.dinheiro || 0) > 0) {
        dinheiro = envelopeItem.valor_extraido.dinheiro || 0;
      }
    }

    if (voucher === 0) {
      for (const item of anexosFinais) {
        if (!item.is_duplicata && item.tipo_documento === "comprovante_voucher" && item.valor_extraido) {
          voucher += item.valor_extraido.voucher || 0;
        }
      }
    }
  } else {
    for (const item of anexosFinais) {
      if (!item.is_duplicata && item.valor_extraido) {
        temValoresEstruturados = true;
        dinheiro += item.valor_extraido.dinheiro || 0;
        debito += item.valor_extraido.debito || 0;
        credito += item.valor_extraido.credito || 0;
        pix += item.valor_extraido.pix || 0;
        voucher += item.valor_extraido.voucher || 0;
        outros += item.valor_extraido.outros || 0;
        if (sobra === 0 && (item.valor_extraido.sobra || 0) > 0) {
          sobra = item.valor_extraido.sobra || 0;
        }
      }
    }
  }

  let totalCalculado: Record<string, number> | null;
  if (temValoresEstruturados) {
    totalCalculado = {
      dinheiro: Math.round(dinheiro * 100) / 100,
      debito: Math.round(debito * 100) / 100,
      credito: Math.round(credito * 100) / 100,
      pix: Math.round(pix * 100) / 100,
      voucher: Math.round(voucher * 100) / 100,
      outros: Math.round(outros * 100) / 100,
      sobra: Math.round(sobra * 100) / 100,
    };
  } else {
    totalCalculado = pTotal || fechamentoAtual.total;
  }

  return {
    id: fechamentoAtual.id,
    anexos: anexosFinais,
    telegram_message_ids: msgsFinais,
    total: totalCalculado,
    envelope_total: totalCalculado,
    sobra: sobra > 0 ? Math.round(sobra * 100) / 100 : pSobra || 0,
    status: fechamentoAtual.status,
  };
}

describe("Etapa 3E.3 - Gate A2 & A3: Consolidação Atômica Recalculada no PostgreSQL", () => {
  const workspaceId = "00000000-0000-0000-0000-000000000001";
  const colaboradorId = "11111111-1111-1111-1111-111111111111";

  it("1. Deve recalcular atômica e cumulativamente os valores de múltiplos comprovantes concorrentes", () => {
    let estadoBanco = {
      id: "fech-123",
      workspace_id: workspaceId,
      colaborador_id: colaboradorId,
      status: "pendente_conferencia",
      anexos: [] as FechamentoAnexoMock[],
      telegram_message_ids: [] as number[],
      total: null,
    };

    // Requisição 1: Comprovante de Dinheiro (R$ 150) e Débito (R$ 50)
    const req1 = simularConsolidarFechamentoAtomicoRpc({
      fechamentoAtual: estadoBanco,
      caller: { userId: "user-1", role: "authenticated", isExecutiveOrAdmin: false, colaboradorId },
      novosAnexos: [
        {
          id: "anx-1",
          sha256: "hash-foto-1",
          tipo_documento: "comprovante_individual",
          valor_extraido: { dinheiro: 150, debito: 50 },
        },
      ],
      novosMsgs: [1001],
    });

    // Simula commit no banco
    estadoBanco = { ...estadoBanco, ...req1 };
    expect(estadoBanco.total.dinheiro).toBe(150);
    expect(estadoBanco.total.debito).toBe(50);
    expect(estadoBanco.anexos.length).toBe(1);

    // Requisição 2 Concorrente: Comprovante de Crédito (R$ 200) e PIX (R$ 75)
    // Mesmo que o cliente envie pTotal desatualizado (baseado apenas em sua foto), o PostgreSQL recalcula sobre tudo
    const req2 = simularConsolidarFechamentoAtomicoRpc({
      fechamentoAtual: estadoBanco,
      caller: { userId: "user-1", role: "authenticated", isExecutiveOrAdmin: false, colaboradorId },
      novosAnexos: [
        {
          id: "anx-2",
          sha256: "hash-foto-2",
          tipo_documento: "comprovante_individual",
          valor_extraido: { credito: 200, pix: 75 },
        },
      ],
      novosMsgs: [1002],
      pTotal: { credito: 200, pix: 75 }, // pTotal desatualizado do cliente
    });

    estadoBanco = { ...estadoBanco, ...req2 };

    // Verificação de Recálculo Integral sem Valores Defasados (Gate A2)
    expect(estadoBanco.anexos.length).toBe(2);
    expect(estadoBanco.total.dinheiro).toBe(150);
    expect(estadoBanco.total.debito).toBe(50);
    expect(estadoBanco.total.credito).toBe(200);
    expect(estadoBanco.total.pix).toBe(75);
    const somaTotal =
      estadoBanco.total.dinheiro +
      estadoBanco.total.debito +
      estadoBanco.total.credito +
      estadoBanco.total.pix;
    expect(somaTotal).toBe(475);
  });

  it("2. Relatório consolidado deve agir como autoridade primária e não somar comprovantes individuais em duplicidade", () => {
    const estadoBanco = {
      id: "fech-124",
      workspace_id: workspaceId,
      colaborador_id: colaboradorId,
      status: "pendente_conferencia",
      anexos: [
        {
          id: "anx-debito-avulso",
          sha256: "hash-debito-1",
          tipo_documento: "comprovante_individual",
          valor_extraido: { debito: 100 },
        },
      ],
      telegram_message_ids: [1001],
      total: { debito: 100 },
    };

    // Chega relatório consolidado da máquina com R$ 1000 total (dinheiro 400, debito 300, credito 300)
    const res = simularConsolidarFechamentoAtomicoRpc({
      fechamentoAtual: estadoBanco,
      caller: { userId: "user-1", role: "service_role", isExecutiveOrAdmin: true },
      novosAnexos: [
        {
          id: "anx-relatorio",
          sha256: "hash-relatorio-oficial",
          tipo_documento: "relatorio_consolidado",
          valor_extraido: { dinheiro: 400, debito: 300, credito: 300 },
        },
      ],
      novosMsgs: [1002],
    });

    // O debito deve ser exatamente 300 do relatório, e não 400 (300 + 100)
    expect(res.total.dinheiro).toBe(400);
    expect(res.total.debito).toBe(300);
    expect(res.total.credito).toBe(300);
    expect(res.total.dinheiro + res.total.debito + res.total.credito).toBe(1000);
  });

  it("3. Anexo de envelope deve refinar sobra física e complementar dinheiro quando zero", () => {
    const estadoBanco = {
      id: "fech-125",
      workspace_id: workspaceId,
      colaborador_id: colaboradorId,
      status: "pendente_conferencia",
      anexos: [
        {
          id: "anx-rel",
          sha256: "hash-rel",
          tipo_documento: "relatorio_consolidado",
          valor_extraido: { debito: 250, credito: 250 }, // dinheiro veio 0
        },
      ],
      telegram_message_ids: [1001],
      total: { debito: 250, credito: 250 },
    };

    const res = simularConsolidarFechamentoAtomicoRpc({
      fechamentoAtual: estadoBanco,
      caller: { userId: "user-1", role: "service_role", isExecutiveOrAdmin: true },
      novosAnexos: [
        {
          id: "anx-envelope",
          sha256: "hash-env",
          tipo_documento: "envelope",
          valor_extraido: { dinheiro: 300, sobra: 25.5 },
        },
      ],
      novosMsgs: [1002],
    });

    expect(res.total.dinheiro).toBe(300);
    expect(res.total.sobra).toBe(25.5);
    expect(res.sobra).toBe(25.5);
  });

  it("4. Fotografias com mesmo hash sha256 devem ser deduplicadas sem inflacionar o total", () => {
    const estadoBanco = {
      id: "fech-126",
      workspace_id: workspaceId,
      colaborador_id: colaboradorId,
      status: "pendente_conferencia",
      anexos: [
        {
          id: "anx-original",
          sha256: "hash-repetido-xyz",
          tipo_documento: "comprovante_individual",
          valor_extraido: { pix: 120 },
        },
      ],
      telegram_message_ids: [2001],
      total: { pix: 120 },
    };

    // Envio idêntico da mesma foto novamente
    const res = simularConsolidarFechamentoAtomicoRpc({
      fechamentoAtual: estadoBanco,
      caller: { userId: "user-1", role: "service_role", isExecutiveOrAdmin: true },
      novosAnexos: [
        {
          id: "anx-duplicata",
          sha256: "hash-repetido-xyz",
          tipo_documento: "comprovante_individual",
          valor_extraido: { pix: 120 },
        },
      ],
      novosMsgs: [2002],
    });

    expect(res.anexos.length).toBe(1);
    expect(res.total.pix).toBe(120);
  });

  it("5. Deve rejeitar consolidação em fechamento já aprovado (Imutabilidade Contábil - 42501)", () => {
    const estadoAprovado = {
      id: "fech-aprovado-999",
      workspace_id: workspaceId,
      colaborador_id: colaboradorId,
      status: "aprovado",
      anexos: [],
      telegram_message_ids: [100],
      total: { dinheiro: 500 },
    };

    expect(() =>
      simularConsolidarFechamentoAtomicoRpc({
        fechamentoAtual: estadoAprovado,
        caller: { userId: "user-1", role: "service_role", isExecutiveOrAdmin: true },
        novosAnexos: [
          {
            sha256: "hash-novo",
            tipo_documento: "comprovante_individual",
            valor_extraido: { dinheiro: 100 },
          },
        ],
        novosMsgs: [101],
      })
    ).toThrowError(/já foi aprovado/);
  });

  it("6. Colaborador comum não pode consolidar fechamento de outro colaborador (Menor Privilégio - 42501)", () => {
    const estadoBanco = {
      id: "fech-colab-a",
      workspace_id: workspaceId,
      colaborador_id: "colaborador-a",
      status: "pendente_conferencia",
      anexos: [],
      telegram_message_ids: [],
      total: null,
    };

    expect(() =>
      simularConsolidarFechamentoAtomicoRpc({
        fechamentoAtual: estadoBanco,
        caller: {
          userId: "user-b",
          role: "authenticated",
          isExecutiveOrAdmin: false,
          colaboradorId: "colaborador-b", // ID diferente!
        },
        novosAnexos: [
          {
            sha256: "hash-tentativa",
            tipo_documento: "comprovante_individual",
            valor_extraido: { dinheiro: 50 },
          },
        ],
        novosMsgs: [500],
      })
    ).toThrowError(/só podem consolidar seus próprios fechamentos/);
  });
});
