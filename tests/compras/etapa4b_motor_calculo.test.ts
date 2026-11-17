import { describe, it, expect } from "vitest";
import {
  calcularSugestaoCompra,
  gerarMensagemConversasLoja,
  ItemCalculoCompra,
} from "../../src/domains/compras/services/ComprasEngine";

describe("Etapa 4B: Motor de Cálculo e Formatadores de Compras (Rodo Point)", () => {
  it("1. Deve calcular corretamente a fórmula base MAX(0, REF - Estoque)", () => {
    const itens: ItemCalculoCompra[] = [
      { produto_nome: "Coxinha", quantidade_referencia: 100, estoque_atual: 40, limite_max_sugerido: 200 },
      { produto_nome: "Kibe", quantidade_referencia: 50, estoque_atual: 50, limite_max_sugerido: 200 }, // Suficiente
      { produto_nome: "Enroladinho", quantidade_referencia: 60, estoque_atual: 70, limite_max_sugerido: 200 }, // Sobra
    ];

    const res = calcularSugestaoCompra(itens, { fornecedorNome: "Salgados", formatoLista: "salgados_soma" });

    expect(res.itens.length).toBe(1);
    expect(res.itens[0].produto_nome).toBe("Coxinha");
    expect(res.itens[0].quantidade_sugerida).toBe(60);
    expect(res.totalUnidadesSugeridas).toBe(60);
  });

  it("2. Deve aplicar aumentos temporários de 25% e 50% sobre a referência", () => {
    const itens: ItemCalculoCompra[] = [
      { produto_nome: "Coca-Cola 350ml", quantidade_referencia: 100, estoque_atual: 20, limite_max_sugerido: 500 },
    ];

    // +25% de aumento: Ref vira 125, sugerida = 125 - 20 = 105
    const res25 = calcularSugestaoCompra(itens, { aumentoTemporarioPct: 25 });
    expect(res25.itens[0].quantidade_sugerida).toBe(105);

    // +50% de aumento: Ref vira 150, sugerida = 150 - 20 = 130
    const res50 = calcularSugestaoCompra(itens, { aumentoTemporarioPct: 50 });
    expect(res50.itens[0].quantidade_sugerida).toBe(130);
  });

  it("3. Deve respeitar o teto de segurança de 50 unidades para produtos online", () => {
    const itens: ItemCalculoCompra[] = [
      { produto_nome: "Produto Online", quantidade_referencia: 100, estoque_atual: 10, limite_max_sugerido: 50 },
    ];

    // Cálculo bruto seria 90, mas deve limitar a 50
    const res = calcularSugestaoCompra(itens);
    expect(res.itens[0].quantidade_sugerida).toBe(50);
    expect(res.itens[0].limite_aplicado).toBe(true);
  });

  it("4. Deve formatar Salgados no padrão exigido: Total | Produto = qtd", () => {
    const itens: ItemCalculoCompra[] = [
      { produto_nome: "Coxinha", quantidade_referencia: 100, estoque_atual: 10, limite_max_sugerido: 200 }, // 90
      { produto_nome: "Kibe", quantidade_referencia: 80, estoque_atual: 30, limite_max_sugerido: 200 }, // 50
      { produto_nome: "Enroladinho de Salsicha", quantidade_referencia: 60, estoque_atual: 10, limite_max_sugerido: 200 }, // 50
    ];

    const res = calcularSugestaoCompra(itens, { fornecedorNome: "Salgados", formatoLista: "salgados_soma" });

    expect(res.totalUnidadesSugeridas).toBe(190);
    expect(res.textoFormatado).toBe("📦 PEDIDO — SALGADOS\n190 | Coxinha = 90, Kibe = 50, Enroladinho de Salsicha = 50");
  });

  it("5. Deve formatar Bebidas (Coca-Cola / Ambev) sem exibir estoque de referência", () => {
    const itens: ItemCalculoCompra[] = [
      { produto_nome: "Coca Zero 350ml", quantidade_referencia: 15, estoque_atual: 5, unidade_medida: "cx", limite_max_sugerido: 100 },
      { produto_nome: "Heineken Long Neck", quantidade_referencia: 20, estoque_atual: 8, unidade_medida: "cx", limite_max_sugerido: 100 },
    ];

    const res = calcularSugestaoCompra(itens, { fornecedorNome: "Coca-Cola", formatoLista: "bebidas_sem_ref" });

    expect(res.textoFormatado).toContain("Coca Zero 350ml = 10 cx");
    expect(res.textoFormatado).toContain("Heineken Long Neck = 12 cx");
    expect(res.textoFormatado).not.toContain("Referência");
    expect(res.textoFormatado).not.toContain("Estoque");
  });

  it("6. Deve formatar Ceasa categorizado por departamentos", () => {
    const itens: ItemCalculoCompra[] = [
      { produto_nome: "Laranja Pêra", categoria: "Frutas", quantidade_referencia: 5, estoque_atual: 1, unidade_medida: "cx", limite_max_sugerido: 20 },
      { produto_nome: "Tomate", categoria: "Legumes", quantidade_referencia: 4, estoque_atual: 1, unidade_medida: "cx", limite_max_sugerido: 20 },
    ];

    const res = calcularSugestaoCompra(itens, { fornecedorNome: "Ceasa", formatoLista: "ceasa_categorias" });

    expect(res.textoFormatado).toContain("[Frutas]");
    expect(res.textoFormatado).toContain("- Laranja Pêra: 4 cx");
    expect(res.textoFormatado).toContain("[Legumes]");
    expect(res.textoFormatado).toContain("- Tomate: 3 cx");
  });

  it("7. Mensagem da Central de Conversas deve conter aviso de Simulação Ativa por padrão", () => {
    const msg = gerarMensagemConversasLoja("190 | Coxinha = 90", "Salgados", true, 0);

    expect(msg).toContain("MODO SIMULAÇÃO — ETAPA 4");
    expect(msg).toContain("Nenhum pedido real foi transmitido");
    expect(msg).toContain("RODO POINT — SUGESTÃO DIÁRIA DE COMPRAS (09h00)");
    expect(msg).toContain("Fornecedor: <b>Salgados</b>");
  });
});
