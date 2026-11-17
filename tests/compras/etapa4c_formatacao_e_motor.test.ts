import { describe, it, expect } from "vitest";
import {
  calcularSugestaoCompra,
  isAumentoTemporarioAtivo,
  classificarCategoriaCeasaBalas,
  ItemCalculoCompra,
} from "../../src/domains/compras/services/ComprasEngine";

describe("Etapa 4C-C: Motor Operacional, Formatações Exatas e Validade (Gates 5, 11 e 12)", () => {
  describe("Gate 5.1: Formatação Exata de Salgados", () => {
    it("1. Deve formatar com título exato e 'REF | Produto = Comprar' sem soma total no topo", () => {
      const itens: ItemCalculoCompra[] = [
        { produto_nome: "Coxinha", quantidade_referencia: 190, estoque_atual: 100 },
        { produto_nome: "Coxinha C/ Catupiry", quantidade_referencia: 210, estoque_atual: 50 },
        { produto_nome: "Kibe", quantidade_referencia: 40, estoque_atual: 20 },
      ];

      const res = calcularSugestaoCompra(itens, { fornecedorNome: "Salgados", formatoLista: "salgados_soma" });

      expect(res.textoFormatado).toContain("🔸 SALGADOS – QUANTIDADE PARA COMPRAR");
      expect(res.textoFormatado).toContain("190 | Coxinha = 90");
      expect(res.textoFormatado).toContain("210 | Coxinha C/ Catupiry = 160");
      expect(res.textoFormatado).toContain("40 | Kibe = 20");
      // Não deve conter a formatação antiga com soma antes dos produtos
      expect(res.textoFormatado).not.toMatch(/^\d+\s*\|\s*Coxinha/);
    });
  });

  describe("Gate 5.2 e 5.3: Formatação Exata de Coca-Cola e Ambev", () => {
    it("2. Deve formatar Coca-Cola limpa para o vendedor: Produto = Quantidade", () => {
      const itens: ItemCalculoCompra[] = [
        { produto_nome: "Coca 350ml zero", quantidade_referencia: 10, estoque_atual: 8 },
        { produto_nome: "Coca 350ml original", quantidade_referencia: 15, estoque_atual: 8 },
        { produto_nome: "Monster ENERGY", quantidade_referencia: 5, estoque_atual: 4 },
      ];

      const res = calcularSugestaoCompra(itens, { fornecedorNome: "Coca-Cola", formatoLista: "bebidas_sem_ref" });

      expect(res.textoFormatado).toBe("Coca 350ml zero = 2\nCoca 350ml original = 7\nMonster ENERGY = 1");
      expect(res.textoFormatado).not.toContain("10 |");
      expect(res.textoFormatado).not.toContain("Estoque");
    });

    it("3. Deve formatar Ambev limpa para o vendedor: Produto = Quantidade", () => {
      const itens: ItemCalculoCompra[] = [
        { produto_nome: "Pepsi lata", quantidade_referencia: 5, estoque_atual: 4 },
        { produto_nome: "Red Bull 250 ml", quantidade_referencia: 6, estoque_atual: 4 },
        { produto_nome: "H2Oh comum", quantidade_referencia: 3, estoque_atual: 2 },
      ];

      const res = calcularSugestaoCompra(itens, { fornecedorNome: "Ambev", formatoLista: "bebidas_sem_ref" });

      expect(res.textoFormatado).toBe("Pepsi lata = 1\nRed Bull 250 ml = 2\nH2Oh comum = 1");
    });
  });

  describe("Gate 5.4: Formatação Ceasa Balas e Doces por Categorias", () => {
    it("4. Deve organizar produtos nas categorias oficiais sem misturar com hortifrúti", () => {
      const itens: ItemCalculoCompra[] = [
        { produto_nome: "Trident Menta", quantidade_referencia: 10, estoque_atual: 5 },
        { produto_nome: "Halls Preto", quantidade_referencia: 15, estoque_atual: 5 },
        { produto_nome: "Mentos Fruit", quantidade_referencia: 8, estoque_atual: 3 },
        { produto_nome: "Bala Chita", quantidade_referencia: 12, estoque_atual: 2 },
        { produto_nome: "Bombom Sonho de Valsa", quantidade_referencia: 20, estoque_atual: 10 },
        { produto_nome: "Torcida Queijo", quantidade_referencia: 15, estoque_atual: 5 },
      ];

      const res = calcularSugestaoCompra(itens, { fornecedorNome: "Ceasa Balas e Doces", formatoLista: "ceasa_categorias" });

      expect(res.textoFormatado).toContain("[Trident]\nTrident Menta = 5");
      expect(res.textoFormatado).toContain("[Halls]\nHalls Preto = 10");
      expect(res.textoFormatado).toContain("[Mentos]\nMentos Fruit = 5");
      expect(res.textoFormatado).toContain("[Balas]\nBala Chita = 10");
      expect(res.textoFormatado).toContain("[Doces e Chocolates]\nBombom Sonho de Valsa = 10");
      expect(res.textoFormatado).toContain("[Salgadinhos e Pipocas]\nTorcida Queijo = 10");
      expect(res.textoFormatado).not.toContain("Frutas");
      expect(res.textoFormatado).not.toContain("Legumes");
    });

    it("5. Classificador de categorias Ceasa Balas deve mapear itens corretamente", () => {
      expect(classificarCategoriaCeasaBalas("Trident Melancia")).toBe("Trident");
      expect(classificarCategoriaCeasaBalas("Halls Cereja")).toBe("Halls");
      expect(classificarCategoriaCeasaBalas("Mentos Menta")).toBe("Mentos");
      expect(classificarCategoriaCeasaBalas("Pirulito Pop")).toBe("Balas");
      expect(classificarCategoriaCeasaBalas("Barra Lacta")).toBe("Doces e Chocolates");
      expect(classificarCategoriaCeasaBalas("Pipoca Doce")).toBe("Salgadinhos e Pipocas");
    });
  });

  describe("Gate 11: Aumentos Temporários com Validade", () => {
    it("6. Deve aplicar aumento temporário quando data operacional estiver dentro do período", () => {
      const ativo = isAumentoTemporarioAtivo("2026-11-20", "2026-11-15", "2026-11-25");
      expect(ativo).toBe(true);

      const itens: ItemCalculoCompra[] = [
        { produto_nome: "Coca 350ml original", quantidade_referencia: 100, estoque_atual: 20 },
      ];

      // +50% com vigência ativa: Ref 150 - 20 = 130
      const res = calcularSugestaoCompra(itens, {
        aumentoTemporarioPct: 50,
        aumentoValidadeInicio: "2026-11-15",
        aumentoValidadeFim: "2026-11-25",
        dataOperacional: "2026-11-20",
      });

      expect(res.aumentoAtivo).toBe(true);
      expect(res.itens[0].quantidade_sugerida).toBe(130);
    });

    it("7. Deve ignorar aumento temporário quando a validade tiver expirado", () => {
      const ativo = isAumentoTemporarioAtivo("2026-11-30", "2026-11-15", "2026-11-25");
      expect(ativo).toBe(false);

      const itens: ItemCalculoCompra[] = [
        { produto_nome: "Coca 350ml original", quantidade_referencia: 100, estoque_atual: 20 },
      ];

      // Aumento expirado em 25/11, data 30/11: deve retornar à referência normal (100 - 20 = 80)
      const res = calcularSugestaoCompra(itens, {
        aumentoTemporarioPct: 50,
        aumentoValidadeInicio: "2026-11-15",
        aumentoValidadeFim: "2026-11-25",
        dataOperacional: "2026-11-30",
      });

      expect(res.aumentoAtivo).toBe(false);
      expect(res.aumentoTemporarioPct).toBe(0);
      expect(res.itens[0].quantidade_sugerida).toBe(80);
    });
  });

  describe("Gate 12: Ciclo de Vida e Transição de Status do Pedido", () => {
    it("8. Deve marcar 'aguardando_estoque' quando nenhum item tem conferência", () => {
      const itens: ItemCalculoCompra[] = [
        { produto_nome: "Coxinha", quantidade_referencia: 190, status_estoque: "pendente_contagem" },
        { produto_nome: "Kibe", quantidade_referencia: 40, status_estoque: "pendente_contagem" },
      ];

      const res = calcularSugestaoCompra(itens, { fornecedorNome: "Salgados" });
      expect(res.statusPedido).toBe("aguardando_estoque");
      expect(res.totalItensPendentes).toBe(2);
      expect(res.totalItensSugeridos).toBe(0);
    });

    it("9. Deve marcar 'estoque_incompleto' quando apenas parte foi conferida", () => {
      const itens: ItemCalculoCompra[] = [
        { produto_nome: "Coxinha", quantidade_referencia: 190, estoque_atual: 90, status_estoque: "confirmado_positivo" },
        { produto_nome: "Kibe", quantidade_referencia: 40, status_estoque: "pendente_contagem" },
      ];

      const res = calcularSugestaoCompra(itens, { fornecedorNome: "Salgados" });
      expect(res.statusPedido).toBe("estoque_incompleto");
      expect(res.totalItensPendentes).toBe(1);
      expect(res.totalItensSugeridos).toBe(1);
    });

    it("10. Deve marcar 'pedido_calculado' quando todos os itens estão conferidos", () => {
      const itens: ItemCalculoCompra[] = [
        { produto_nome: "Coxinha", quantidade_referencia: 190, estoque_atual: 90, status_estoque: "confirmado_positivo" },
        { produto_nome: "Kibe", quantidade_referencia: 40, estoque_atual: 0, status_estoque: "confirmado_zero" },
      ];

      const res = calcularSugestaoCompra(itens, { fornecedorNome: "Salgados" });
      expect(res.statusPedido).toBe("pedido_calculado");
      expect(res.totalItensPendentes).toBe(0);
      expect(res.totalItensSugeridos).toBe(2);
    });
  });
});
