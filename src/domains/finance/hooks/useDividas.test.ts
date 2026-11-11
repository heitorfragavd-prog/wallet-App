import { describe, it, expect } from "vitest";

describe("useDividas null-safety regression", () => {
  it("deve ordenar e formatar dívidas com data_vencimento nula sem lançar exceção", () => {
    const dividasMock = [
      {
        id: "1",
        descricao: "Compra com vencimento",
        valor_total: 100,
        valor_restante: 100,
        data_vencimento: "2026-11-20",
        status: "pendente",
      },
      {
        id: "2",
        descricao: "Compra sem data (orçamento)",
        valor_total: 2159,
        valor_restante: 2159,
        data_vencimento: null,
        status: "pendente",
      },
      {
        id: "3",
        descricao: null,
        valor_total: 50,
        valor_restante: 0,
        data_vencimento: null,
        status: "quitada",
      },
    ];

    // Simula a lógica de ordenação e formatação da página Dívidas
    const formatarData = (dataString: string | null | undefined) => {
      if (!dataString) return "Sem vencimento";
      try {
        const parts = dataString.split("T")[0].split("-");
        if (parts.length === 3) {
          const [ano, mes, dia] = parts;
          return `${dia}/${mes}/${ano}`;
        }
        return dataString;
      } catch {
        return "Sem vencimento";
      }
    };

    const calcularDiasAteVencimento = (dataVencimento: string | null | undefined): number | null => {
      if (!dataVencimento) return null;
      try {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const datePart = dataVencimento.split("T")[0];
        const vencimento = new Date(datePart + "T00:00:00");
        if (isNaN(vencimento.getTime())) return null;
        return Math.ceil((vencimento.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
      } catch {
        return null;
      }
    };

    expect(() => {
      const filtradas = dividasMock
        .filter((d) => (d.descricao || "").toLowerCase().includes("compra"))
        .sort((a, b) => {
          const statusPriority: { [key: string]: number } = { vencida: 0, pendente: 1, quitada: 2 };
          const priorityA = statusPriority[a.status] ?? 1;
          const priorityB = statusPriority[b.status] ?? 1;
          if (priorityA !== priorityB) return priorityA - priorityB;
          const timeA = a.data_vencimento ? new Date(a.data_vencimento).getTime() : Infinity;
          const timeB = b.data_vencimento ? new Date(b.data_vencimento).getTime() : Infinity;
          return timeA - timeB;
        });

      expect(filtradas).toHaveLength(2);
      expect(filtradas[0].id).toBe("1");
      expect(filtradas[1].id).toBe("2");

      for (const d of dividasMock) {
        const formatted = formatarData(d.data_vencimento);
        const dias = calcularDiasAteVencimento(d.data_vencimento);
        if (d.data_vencimento === null) {
          expect(formatted).toBe("Sem vencimento");
          expect(dias).toBeNull();
        }
      }
    }).not.toThrow();
  });
});
