import { describe, it, expect } from "vitest";

describe("Etapa 3E.2 - Gates 4 & 5: Escala Mensal, Descanso de 11h, Proposta vs Aprovação e Agendamentos", () => {
  interface Colaborador {
    id: string;
    nome: string;
    tipo: "folguista" | "funcionario";
  }

  interface EscalaItem {
    id?: string;
    colaborador_id: string;
    data: string;
    turno: "manha" | "noite";
    status: "proposta" | "programada" | "confirmada" | "cancelada" | "recusada";
    observacao?: string;
  }

  // Motor puro de escala mensal com descanso estrito de 11 horas e status de proposta
  function gerarPropostasEscalaMensal(params: {
    folguistas: Colaborador[];
    diasFimSemana: Array<{ data: string; diaSemana: "sabado" | "domingo" }>;
    escalasExistentes: EscalaItem[];
  }): {
    propostas: EscalaItem[];
    vagasDescobertasDescanso: Array<{ data: string; turno: string; motivo: string }>;
  } {
    const slotsExistentesSet = new Set(
      params.escalasExistentes
        .filter((e) => e.status === "programada" || e.status === "confirmada")
        .map((e) => `${e.data}_${e.turno}`)
    );

    const escalasMap = new Map<string, Array<{ data: string; turno: "manha" | "noite" }>>();
    for (const e of params.escalasExistentes) {
      if (e.status === "cancelada" || e.status === "recusada") continue;
      const list = escalasMap.get(e.colaborador_id) || [];
      list.push({ data: e.data, turno: e.turno });
      escalasMap.set(e.colaborador_id, list);
    }

    const turnosContador = new Map<string, number>();
    for (const f of params.folguistas) {
      turnosContador.set(f.id, (escalasMap.get(f.id) || []).length);
    }

    const propostas: EscalaItem[] = [];
    const vagasDescobertasDescanso: Array<{ data: string; turno: string; motivo: string }> = [];

    const isDescansoValido = (colabId: string, dataSlot: string, turnoSlot: "manha" | "noite"): boolean => {
      const historico = escalasMap.get(colabId) || [];

      // 1. Proibição de dois turnos no mesmo dia
      if (historico.some((h) => h.data === dataSlot)) {
        return false;
      }

      // 2. Se Manhã (05h00): não pode ter trabalhado na Noite do dia anterior (término 22h30 = 6h30 descanso < 11h)
      if (turnoSlot === "manha") {
        const d = new Date(dataSlot + "T12:00:00Z");
        d.setUTCDate(d.getUTCDate() - 1);
        const diaAnterior = d.toISOString().split("T")[0];
        if (historico.some((h) => h.data === diaAnterior && h.turno === "noite")) {
          return false;
        }
      }

      // 3. Se Noite (22h30): não pode estar na Manhã do dia seguinte (início 05h00 = 6h30 descanso < 11h)
      if (turnoSlot === "noite") {
        const d = new Date(dataSlot + "T12:00:00Z");
        d.setUTCDate(d.getUTCDate() + 1);
        const diaSeguinte = d.toISOString().split("T")[0];
        if (historico.some((h) => h.data === diaSeguinte && h.turno === "manha")) {
          return false;
        }
      }

      return true;
    };

    for (const slot of params.diasFimSemana) {
      for (const turno of ["manha", "noite"] as const) {
        const slotKey = `${slot.data}_${turno}`;
        if (slotsExistentesSet.has(slotKey)) {
          continue; // Preserva escala aprovada existente
        }

        const elegiveis = params.folguistas.filter((c) => isDescansoValido(c.id, slot.data, turno));

        if (elegiveis.length > 0) {
          // Equilíbrio: prioriza quem tem menor número de turnos atribuídos
          elegiveis.sort((a, b) => {
            const countA = turnosContador.get(a.id) || 0;
            const countB = turnosContador.get(b.id) || 0;
            return countA - countB;
          });

          const escolhido = elegiveis[0];
          const hist = escalasMap.get(escolhido.id) || [];
          hist.push({ data: slot.data, turno });
          escalasMap.set(escolhido.id, hist);
          turnosContador.set(escolhido.id, (turnosContador.get(escolhido.id) || 0) + 1);

          propostas.push({
            colaborador_id: escolhido.id,
            data: slot.data,
            turno,
            status: "proposta",
            observacao: "PROPOSTA — Aguardando Aprovação Administrativa",
          });
        } else {
          vagasDescobertasDescanso.push({
            data: slot.data,
            turno,
            motivo: "Vaga mantida aberta por descanso mínimo de 11 horas",
          });
        }
      }
    }

    return { propostas, vagasDescobertasDescanso };
  }

  // Simulação da verificação de vagas descobertas na consulta de segunda-feira
  function verificarVagasConsultaSegunda(
    slotsFimSemana: Array<{ data: string; turno: "manha" | "noite" }>,
    escalasBanco: EscalaItem[]
  ): Array<{ data: string; turno: "manha" | "noite" }> {
    const vagasDescobertas: Array<{ data: string; turno: "manha" | "noite" }> = [];

    for (const slot of slotsFimSemana) {
      // Vaga só é coberta se houver escala válida em 'programada' ou 'confirmada'
      const coberta = escalasBanco.some(
        (e) =>
          e.data === slot.data &&
          e.turno === slot.turno &&
          Boolean(e.colaborador_id) &&
          e.status !== "proposta" &&
          e.status !== "cancelada" &&
          e.status !== "recusada"
      );

      if (!coberta) {
        vagasDescobertas.push(slot);
      }
    }

    return vagasDescobertas;
  }

  // Simulação da verificação da confirmação de sexta-feira por colaborador, data E turno
  function verificarConfirmacoesPendentesSexta(
    escalados: Array<{ colaborador_id: string; data: string; turno: "manha" | "noite" }>,
    confirmacoes: Array<{ colaborador_id: string; data: string; turno: string; confirmado: boolean }>
  ): Array<{ colaborador_id: string; data: string; turno: "manha" | "noite" }> {
    const confirmadosSet = new Set(
      confirmacoes
        .filter((c) => c.confirmado)
        .map((c) => `${c.colaborador_id}_${c.data}_${c.turno}`)
    );

    return escalados.filter(
      (e) => !confirmadosSet.has(`${e.colaborador_id}_${e.data}_${e.turno}`)
    );
  }

  it("1. Não deve escalar o mesmo colaborador no Sábado Noite e Domingo Manhã (descanso < 11h)", () => {
    const folguistas: Colaborador[] = [
      { id: "colab-1", nome: "João Folguista", tipo: "folguista" },
      { id: "colab-2", nome: "Maria Folguista", tipo: "folguista" },
    ];

    const fimDeSemana = [
      { data: "2026-11-21", diaSemana: "sabado" as const },
      { data: "2026-11-22", diaSemana: "domingo" as const },
    ];

    const res = gerarPropostasEscalaMensal({
      folguistas,
      diasFimSemana: fimDeSemana,
      escalasExistentes: [],
    });

    expect(res.propostas).toHaveLength(4);

    const sabadoNoite = res.propostas.find((p) => p.data === "2026-11-21" && p.turno === "noite");
    const domingoManha = res.propostas.find((p) => p.data === "2026-11-22" && p.turno === "manha");

    expect(sabadoNoite).toBeDefined();
    expect(domingoManha).toBeDefined();

    // Regra inegociável de descanso: quem fez sábado à noite NÃO pode fazer domingo de manhã!
    expect(sabadoNoite?.colaborador_id).not.toBe(domingoManha?.colaborador_id);
  });

  it("2. Não deve escalar o mesmo colaborador em dois turnos no mesmo dia", () => {
    const folguistas: Colaborador[] = [
      { id: "colab-1", nome: "João Folguista", tipo: "folguista" },
      { id: "colab-2", nome: "Maria Folguista", tipo: "folguista" },
    ];

    const fimDeSemana = [{ data: "2026-11-21", diaSemana: "sabado" as const }];

    const res = gerarPropostasEscalaMensal({
      folguistas,
      diasFimSemana: fimDeSemana,
      escalasExistentes: [],
    });

    const sabadoManha = res.propostas.find((p) => p.data === "2026-11-21" && p.turno === "manha");
    const sabadoNoite = res.propostas.find((p) => p.data === "2026-11-21" && p.turno === "noite");

    expect(sabadoManha?.colaborador_id).not.toBe(sabadoNoite?.colaborador_id);
  });

  it("3. As escalas geradas pelo motor mensal devem ter status explícito de 'proposta'", () => {
    const folguistas: Colaborador[] = [{ id: "colab-1", nome: "João", tipo: "folguista" }];
    const fimDeSemana = [{ data: "2026-11-21", diaSemana: "sabado" as const }];

    const res = gerarPropostasEscalaMensal({
      folguistas,
      diasFimSemana: fimDeSemana,
      escalasExistentes: [],
    });

    expect(res.propostas[0].status).toBe("proposta");
    expect(res.propostas[0].observacao).toContain("PROPOSTA — Aguardando Aprovação");
  });

  it("4. Deve preservar escalas existentes com status 'programada' ou 'confirmada'", () => {
    const folguistas: Colaborador[] = [
      { id: "colab-1", nome: "João", tipo: "folguista" },
      { id: "colab-2", nome: "Maria", tipo: "folguista" },
    ];

    const fimDeSemana = [{ data: "2026-11-21", diaSemana: "sabado" as const }];
    const escalaAprovada: EscalaItem = {
      id: "esc-oficial-1",
      colaborador_id: "colab-1",
      data: "2026-11-21",
      turno: "manha",
      status: "confirmada",
      observacao: "Escala Oficial Aprovada",
    };

    const res = gerarPropostasEscalaMensal({
      folguistas,
      diasFimSemana: fimDeSemana,
      escalasExistentes: [escalaAprovada],
    });

    // O slot de sábado manhã não deve gerar nova proposta porque já está confirmado
    const propostaManha = res.propostas.find((p) => p.data === "2026-11-21" && p.turno === "manha");
    expect(propostaManha).toBeUndefined();

    // Apenas sábado noite gera proposta
    const propostaNoite = res.propostas.find((p) => p.data === "2026-11-21" && p.turno === "noite");
    expect(propostaNoite).toBeDefined();
    expect(propostaNoite?.colaborador_id).toBe("colab-2"); // Colab-1 já trabalha de manhã
  });

  it("5. Consulta de segunda-feira não deve considerar escalas com status 'proposta' como cobertas", () => {
    const slots = [
      { data: "2026-11-21", turno: "manha" as const },
      { data: "2026-11-21", turno: "noite" as const },
    ];

    const escalasBanco: EscalaItem[] = [
      {
        colaborador_id: "colab-1",
        data: "2026-11-21",
        turno: "manha",
        status: "proposta", // Proposta ainda não aprovada pela gestão!
      },
      {
        colaborador_id: "colab-2",
        data: "2026-11-21",
        turno: "noite",
        status: "confirmada", // Oficialmente coberta
      },
    ];

    const vagasDescobertas = verificarVagasConsultaSegunda(slots, escalasBanco);

    // O turno da manhã DEVE ser apontado como vaga descoberta porque só tem 'proposta'
    expect(vagasDescobertas).toHaveLength(1);
    expect(vagasDescobertas[0]).toEqual({ data: "2026-11-21", turno: "manha" });
  });

  it("6. Confirmação de sexta-feira deve validar estritamente por colaborador, data E turno", () => {
    const escalados = [
      { colaborador_id: "colab-1", data: "2026-11-21", turno: "manha" as const },
      { colaborador_id: "colab-1", data: "2026-11-22", turno: "noite" as const },
    ];

    // O colaborador confirmou sábado manhã, mas AINDA NÃO confirmou domingo noite!
    const confirmacoes = [
      { colaborador_id: "colab-1", data: "2026-11-21", turno: "manha", confirmado: true },
    ];

    const pendentes = verificarConfirmacoesPendentesSexta(escalados, confirmacoes);

    // Domingo noite permanece pendente de confirmação
    expect(pendentes).toHaveLength(1);
    expect(pendentes[0]).toEqual({
      colaborador_id: "colab-1",
      data: "2026-11-22",
      turno: "noite",
    });
  });

  it("7. Equilíbrio de turnos: deve balancear a distribuição entre folguistas disponíveis", () => {
    const folguistas: Colaborador[] = [
      { id: "colab-1", nome: "João", tipo: "folguista" },
      { id: "colab-2", nome: "Maria", tipo: "folguista" },
      { id: "colab-3", nome: "Carlos", tipo: "folguista" },
    ];

    const fds = [
      { data: "2026-11-21", diaSemana: "sabado" as const },
      { data: "2026-11-22", diaSemana: "domingo" as const },
      { data: "2026-11-28", diaSemana: "sabado" as const },
      { data: "2026-11-29", diaSemana: "domingo" as const },
    ];

    const res = gerarPropostasEscalaMensal({
      folguistas,
      diasFimSemana: fds,
      escalasExistentes: [],
    });

    expect(res.propostas).toHaveLength(8);

    const counts: Record<string, number> = {};
    for (const p of res.propostas) {
      counts[p.colaborador_id] = (counts[p.colaborador_id] || 0) + 1;
    }

    // Todos devem receber turnos equilibrados (entre 2 e 3 turnos para 8 slots e 3 folguistas)
    expect(counts["colab-1"]).toBeGreaterThanOrEqual(2);
    expect(counts["colab-2"]).toBeGreaterThanOrEqual(2);
    expect(counts["colab-3"]).toBeGreaterThanOrEqual(2);
  });
});
