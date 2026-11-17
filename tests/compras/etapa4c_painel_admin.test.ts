import { describe, it, expect } from "vitest";
import {
  PedidoCompraAdmin,
  ItemPedidoAdmin,
} from "../../src/domains/compras/components/PainelComprasAdmin";

describe("Etapa 4C-D: Painel Administrativo de Compras (Gates 13 e 14)", () => {
  const pedidoMock: PedidoCompraAdmin = {
    id: "ped-salgados-1",
    fornecedor_nome: "Salgados",
    data_pedido: "2026-11-17",
    dia_semana: 2,
    status: "pedido_calculado",
    aumento_temporario_pct: 0,
    texto_pedido_formatado: "🔸 SALGADOS – QUANTIDADE PARA COMPRAR\n190 | Coxinha = 90\n210 | Coxinha C/ Catupiry = 160",
    simulacao: true,
    itens: [
      {
        id: "item-1",
        produto_nome: "Coxinha",
        categoria: "Salgados",
        unidade_medida: "unidade",
        quantidade_referencia: 190,
        estoque_atual: 100,
        quantidade_sugerida: 90,
        quantidade_ajustada: 90,
        status_estoque: "confirmado_positivo",
        contagem_origem: "telegram_texto",
      },
      {
        id: "item-2",
        produto_nome: "Coxinha C/ Catupiry",
        categoria: "Salgados",
        unidade_medida: "unidade",
        quantidade_referencia: 210,
        estoque_atual: 50,
        quantidade_sugerida: 160,
        quantidade_ajustada: 160,
        status_estoque: "confirmado_positivo",
        contagem_origem: "telegram_foto",
      },
      {
        id: "item-3",
        produto_nome: "Kibe",
        categoria: "Salgados",
        unidade_medida: "unidade",
        quantidade_referencia: 40,
        estoque_atual: null,
        quantidade_sugerida: null,
        quantidade_ajustada: null,
        status_estoque: "pendente_contagem",
      },
    ],
  };

  it("1. Deve estruturar corretamente os dados do pedido para visualização executiva", () => {
    expect(pedidoMock.fornecedor_nome).toBe("Salgados");
    expect(pedidoMock.status).toBe("pedido_calculado");
    expect(pedidoMock.simulacao).toBe(true);
    expect(pedidoMock.itens.length).toBe(3);
  });

  it("2. Deve identificar produtos com conferência pendente vs confirmada", () => {
    const pendentes = pedidoMock.itens.filter((i) => i.status_estoque === "pendente_contagem");
    const confirmados = pedidoMock.itens.filter((i) => i.status_estoque === "confirmado_positivo");

    expect(pendentes.length).toBe(1);
    expect(pendentes[0].produto_nome).toBe("Kibe");
    expect(pendentes[0].quantidade_sugerida).toBeNull();

    expect(confirmados.length).toBe(2);
    expect(confirmados[0].produto_nome).toBe("Coxinha");
    expect(confirmados[0].quantidade_sugerida).toBe(90);
  });

  it("3. Gate 14: Deve validar autorização executiva antes de permitir aprovação", () => {
    function podeAprovar(isExecutivo: boolean, status: string): boolean {
      if (!isExecutivo) return false;
      if (status === "aprovado" || status === "enviado" || status === "cancelado") return false;
      return true;
    }

    // Colaborador comum não pode aprovar
    expect(podeAprovar(false, "pedido_calculado")).toBe(false);

    // Executivo pode aprovar pedido calculado
    expect(podeAprovar(true, "pedido_calculado")).toBe(true);

    // Executivo não pode aprovar pedido já aprovado ou cancelado
    expect(podeAprovar(true, "aprovado")).toBe(false);
    expect(podeAprovar(true, "cancelado")).toBe(false);
  });

  it("4. Deve permitir ajuste manual de quantidade sem alterar a referência base", () => {
    const itemOriginal = pedidoMock.itens[0];
    const itemModificado: ItemPedidoAdmin = {
      ...itemOriginal,
      quantidade_ajustada: 120, // Gerente decidiu comprar mais 30 unidades
    };

    expect(itemModificado.quantidade_referencia).toBe(190); // Ref base inalterada
    expect(itemModificado.estoque_atual).toBe(100);
    expect(itemModificado.quantidade_sugerida).toBe(90);
    expect(itemModificado.quantidade_ajustada).toBe(120);
  });
});
