import { describe, it, expect } from "vitest";
import {
  interpretarTextoEstoque,
  extrairQuantidadeDoTrecho,
  ReferenciaProdutoDB,
} from "../../supabase/functions/_shared/ai/compras-telegram-engine";
import {
  interpretarMensagemEstoque,
  PRODUTOS_RODO_POINT_REFERENCIAS,
} from "../../src/domains/compras/services/ComprasTelegramInterpreter";

describe("Etapa 4D.1 - PR 4D.1-A: Catálogo Oficial e Interpretação NLP de Quantidades (Gate 3)", () => {
  const catalogoMock: ReferenciaProdutoDB[] = [
    {
      id: "ref-1",
      workspace_id: "ws-rodo",
      fornecedor_id: "forn-coca",
      fornecedor_nome: "Coca-Cola",
      produto_nome: "Coca 350ml original",
      categoria: "Refrigerantes",
      unidade_medida: "caixa",
      quantidade_referencia: 15,
      validacao_status: "confirmado",
      ativo: true,
    },
    {
      id: "ref-2",
      workspace_id: "ws-rodo",
      fornecedor_id: "forn-coca",
      fornecedor_nome: "Coca-Cola",
      produto_nome: "Coca 350ml zero",
      categoria: "Refrigerantes",
      unidade_medida: "caixa",
      quantidade_referencia: 10,
      validacao_status: "confirmado",
      ativo: true,
    },
    {
      id: "ref-3",
      workspace_id: "ws-rodo",
      fornecedor_id: "forn-coca",
      fornecedor_nome: "Coca-Cola",
      produto_nome: "Coca 200ml",
      categoria: "Refrigerantes",
      unidade_medida: "fardo",
      quantidade_referencia: 6,
      validacao_status: "pendente_validacao",
      ativo: true,
    },
    {
      id: "ref-4",
      workspace_id: "ws-rodo",
      fornecedor_id: "forn-ceasa",
      fornecedor_nome: "Ceasa",
      produto_nome: "Red Bull 250 ml",
      categoria: "Energéticos",
      unidade_medida: "caixa",
      quantidade_referencia: 8,
      validacao_status: "pendente_validacao",
      ativo: true,
    },
    {
      id: "ref-5",
      workspace_id: "ws-rodo",
      fornecedor_id: "forn-ceasa",
      fornecedor_nome: "Ceasa",
      produto_nome: "Red Bull 473 ml",
      categoria: "Energéticos",
      unidade_medida: "caixa",
      quantidade_referencia: 4,
      validacao_status: "pendente_validacao",
      ativo: true,
    },
    {
      id: "ref-6",
      workspace_id: "ws-rodo",
      fornecedor_id: "forn-coca",
      fornecedor_nome: "Coca-Cola",
      produto_nome: "Monster Mango Loco",
      categoria: "Energéticos",
      unidade_medida: "caixa",
      quantidade_referencia: 6,
      validacao_status: "pendente_validacao",
      ativo: true,
    },
    {
      id: "ref-7",
      workspace_id: "ws-rodo",
      fornecedor_id: "forn-salgados",
      fornecedor_nome: "Salgados",
      produto_nome: "Coxinha",
      categoria: "Salgados Fritos",
      unidade_medida: "unidade",
      quantidade_referencia: 190,
      validacao_status: "confirmado",
      ativo: true,
    },
    {
      id: "ref-8",
      workspace_id: "ws-rodo",
      fornecedor_id: "forn-salgados",
      fornecedor_nome: "Salgados",
      produto_nome: "Coxinha C/ Catupiry",
      categoria: "Salgados Fritos",
      unidade_medida: "unidade",
      quantidade_referencia: 210,
      validacao_status: "confirmado",
      ativo: true,
    },
    {
      id: "ref-9",
      workspace_id: "ws-rodo",
      fornecedor_id: "forn-salgados",
      fornecedor_nome: "Salgados",
      produto_nome: "Kibe",
      categoria: "Salgados Fritos",
      unidade_medida: "unidade",
      quantidade_referencia: 40,
      validacao_status: "confirmado",
      ativo: true,
    },
  ];

  describe("1. Isolamento de Volumes/Mililitros vs Quantidade de Estoque", () => {
    it("deve interpretar 'Red Bull 250 ml = 3' como estoque 3 (e não 250)", () => {
      const { itens } = interpretarTextoEstoque("Red Bull 250 ml = 3", catalogoMock);
      expect(itens.length).toBe(1);
      expect(itens[0].produto_nome).toBe("Red Bull 250 ml");
      expect(itens[0].quantidade_informada).toBe(3);
      expect(itens[0].tipo_informacao).toBe("confirmado_positivo");
    });

    it("deve interpretar 'Coca 200 ml = 8' como estoque 8 (e não 200)", () => {
      const { itens } = interpretarTextoEstoque("Coca 200 ml = 8", catalogoMock);
      expect(itens.length).toBe(1);
      expect(itens[0].produto_nome).toBe("Coca 200ml");
      expect(itens[0].quantidade_informada).toBe(8);
      expect(itens[0].tipo_informacao).toBe("confirmado_positivo");
    });

    it("deve interpretar 'Coca 350 ml Zero = 2' como estoque 2 (e não 350)", () => {
      const { itens } = interpretarTextoEstoque("Coca 350 ml Zero = 2", catalogoMock);
      expect(itens.length).toBe(1);
      expect(itens[0].produto_nome).toBe("Coca 350ml zero");
      expect(itens[0].quantidade_informada).toBe(2);
      expect(itens[0].tipo_informacao).toBe("confirmado_positivo");
    });

    it("deve interpretar 'Red Bull 473 ml tem 4 caixas' como estoque 4 (e não 473)", () => {
      const { itens } = interpretarTextoEstoque("Red Bull 473 ml tem 4 caixas", catalogoMock);
      expect(itens.length).toBe(1);
      expect(itens[0].produto_nome).toBe("Red Bull 473 ml");
      expect(itens[0].quantidade_informada).toBe(4);
    });

    it("função auxiliar extrairQuantidadeDoTrecho deve descartar 250ml e capturar 3", () => {
      const qtd = extrairQuantidadeDoTrecho("Red Bull 250 ml = 3", "Red Bull 250 ml");
      expect(qtd).toBe(3);
    });
  });

  describe("2. Isolamento de Estoque Zero e Não Propagação entre Itens", () => {
    it("em 'Kibe acabou. Coxinha não contei.', o Kibe deve ser zero e Coxinha deve ser pendente", () => {
      const { itens } = interpretarTextoEstoque("Kibe acabou. Coxinha não contei.", catalogoMock);
      expect(itens.length).toBe(2);

      const kibe = itens.find((i) => i.produto_nome === "Kibe");
      const coxinha = itens.find((i) => i.produto_nome === "Coxinha");

      expect(kibe).toBeDefined();
      expect(kibe?.quantidade_informada).toBe(0);
      expect(kibe?.tipo_informacao).toBe("confirmado_zero");

      expect(coxinha).toBeDefined();
      expect(coxinha?.quantidade_informada).toBeNull();
      expect(coxinha?.tipo_informacao).toBe("pendente");
    });

    it("em 'Kibe zerou. Coxinha 15.', Coxinha deve ser positivo (15) e não zero", () => {
      const { itens } = interpretarTextoEstoque("Kibe zerou. Coxinha 15.", catalogoMock);
      expect(itens.length).toBe(2);

      const kibe = itens.find((i) => i.produto_nome === "Kibe");
      const coxinha = itens.find((i) => i.produto_nome === "Coxinha");

      expect(kibe?.quantidade_informada).toBe(0);
      expect(kibe?.tipo_informacao).toBe("confirmado_zero");

      expect(coxinha?.quantidade_informada).toBe(15);
      expect(coxinha?.tipo_informacao).toBe("confirmado_positivo");
    });

    it("não deve propagar 'acabou' global no interpretador frontend ComprasTelegramInterpreter", () => {
      const res = interpretarMensagemEstoque("Kibe acabou. Coxinha não contei.", PRODUTOS_RODO_POINT_REFERENCIAS);
      const kibe = res.itens.find((i) => i.produto_nome === "Kibe");
      const coxinha = res.itens.find((i) => i.produto_nome === "Coxinha");

      expect(kibe?.tipo_informacao).toBe("confirmado_zero");
      expect(kibe?.quantidade_informada).toBe(0);

      expect(coxinha?.tipo_informacao).toBe("pendente");
      expect(coxinha?.quantidade_informada).toBeNull();
    });
  });

  describe("3. Testes Obrigatórios de Variantes, Sabores e Semântica", () => {
    it("Coca Zero sem quantidade deve permanecer como pendente (sem número falso)", () => {
      const { itens } = interpretarTextoEstoque("Coca Zero", catalogoMock);
      expect(itens.length).toBe(1);
      expect(itens[0].produto_nome).toBe("Coca 350ml zero");
      expect(itens[0].quantidade_informada).toBeNull();
      expect(itens[0].tipo_informacao).toBe("pendente");
    });

    it("deve identificar sabor específico de Monster (Monster Mango Loco = 5)", () => {
      const { itens } = interpretarTextoEstoque("Monster Mango Loco = 5", catalogoMock);
      expect(itens.length).toBe(1);
      expect(itens[0].produto_nome).toBe("Monster Mango Loco");
      expect(itens[0].quantidade_informada).toBe(5);
    });

    it("deve distinguir Coxinha tradicional de Coxinha com Catupiry", () => {
      const { itens } = interpretarTextoEstoque("Coxinha 30\nCoxinha Catupiry 15", catalogoMock);
      expect(itens.length).toBe(2);

      const trad = itens.find((i) => i.produto_nome === "Coxinha");
      const cat = itens.find((i) => i.produto_nome === "Coxinha C/ Catupiry");

      expect(trad?.quantidade_informada).toBe(30);
      expect(cat?.quantidade_informada).toBe(15);
    });

    it("deve identificar correções operacionais posteriores ('Corrigindo, são 4')", () => {
      const { itens } = interpretarTextoEstoque("Corrigindo, Coxinha são 4", catalogoMock);
      expect(itens.length).toBe(1);
      expect(itens[0].produto_nome).toBe("Coxinha");
      expect(itens[0].quantidade_informada).toBe(4);
      expect(itens[0].is_correcao).toBe(true);
    });

    it("frases sem produto conhecido devem ir para itensNaoReconhecidos", () => {
      const { itens, itensNaoReconhecidos } = interpretarTextoEstoque("Suco de Graviola 10", catalogoMock);
      expect(itens.length).toBe(0);
      expect(itensNaoReconhecidos).toContain("Suco de Graviola 10");
    });
  });
});
