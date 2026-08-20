import { describe, expect, it } from "vitest";
import {
  calculateRotationNeeded,
  calculateTableCropTiles,
  deduplicateAndConsolidateItems,
  validateDanfeMath,
  evaluateStockStatus,
  type DanfeItemRaw,
} from "../../../../supabase/functions/_shared/danfe-extractor";

describe("DANFE Extractor Engine & Security Guards (v1.0.47)", () => {
  // ─── TESTE 1 & 2: ROTAÇÃO ÚNICA POR CONTEÚDO (SEM HEURÍSTICA DE ASPECT RATIO) ───
  describe("1 & 2. Orientação Real por Conteúdo", () => {
    it("Teste 1 — Rotação única: imagem com conteúdo a 90° deve retornar exatamente 90°", () => {
      const rot = calculateRotationNeeded(90);
      expect(rot).toBe(90);
    });

    it("Teste 2 — Paisagem com conteúdo já correto (0°): NÃO deve rotacionar apenas porque a foto é horizontal", () => {
      const rot = calculateRotationNeeded(0);
      expect(rot).toBe(0);
    });

    it("Conteúdo a 180° deve retornar 180°", () => {
      const rot = calculateRotationNeeded(180);
      expect(rot).toBe(180);
    });

    it("Retorno nulo/inválido deve utilizar fallback seguro de 0° (sem rotação arbitrária)", () => {
      const rot = calculateRotationNeeded(null);
      expect(rot).toBe(0);
    });
  });

  // ─── TESTE 3 & 4: REGIÃO DA TABELA (DETECÇÃO REAL VS FALLBACK EXPLÍCITO) ───
  describe("3 & 4. Localização da Tabela de Produtos", () => {
    it("Teste 3 — Região detectada: top = 0.32 e bottom = 0.81 deve calcular tiles estritamente dentro dessa faixa", () => {
      const { tiles, usouFallback, topPercent, bottomPercent } = calculateTableCropTiles(
        1200,
        2000,
        { detectada: true, top: 0.32, bottom: 0.81 },
        2,
        0.15
      );

      expect(usouFallback).toBe(false);
      expect(topPercent).toBe(0.32);
      expect(bottomPercent).toBe(0.81);
      expect(tiles.length).toBe(2);
      expect(tiles[0].y).toBe(Math.floor(2000 * 0.32));
      expect(tiles[1].y + tiles[1].height).toBeLessThanOrEqual(Math.floor(2000 * 0.81) + 5);
    });

    it("Teste 4 — Fallback: quando IA não detecta região com confiança, usa fallback explícito 28%-88%", () => {
      const { tiles, usouFallback, topPercent, bottomPercent } = calculateTableCropTiles(
        1200,
        2000,
        { detectada: false },
        2,
        0.15
      );

      expect(usouFallback).toBe(true);
      expect(topPercent).toBe(0.28);
      expect(bottomPercent).toBe(0.88);
      expect(tiles.length).toBe(2);
    });
  });

  // ─── TESTE 5 & 6: DEDUPLICAÇÃO CONSCIENTE DO OVERLAP ───
  describe("5 & 6. Deduplicação Consciente de Overlap", () => {
    it("Teste 5 — Duplicata verdadeira por overlap: Tile 0 final + Tile 1 início deve resultar em 1 único item", () => {
      const itensComOverlap: DanfeItemRaw[] = [
        {
          codigo: "101",
          descricao: "Schweppes Tonica 350ml",
          quantidade: 10,
          valor_unitario: 5.0,
          valor_total: 50.0,
          _sourceTile: 0,
          _positionInTile: 0,
          _totalItemsInTile: 2,
        },
        {
          codigo: "102",
          descricao: "Monster Mango Loco 473ml",
          quantidade: 5,
          valor_unitario: 8.0,
          valor_total: 40.0,
          _sourceTile: 0,
          _positionInTile: 1,
          _totalItemsInTile: 2,
        },
        // Início do Tile 1 (mesmo produto capturado pela sobreposição)
        {
          codigo: "102",
          descricao: "Monster Mango Loco 473ml",
          quantidade: 5,
          valor_unitario: 8.0,
          valor_total: 40.0,
          _sourceTile: 1,
          _positionInTile: 0,
          _totalItemsInTile: 2,
        },
        {
          codigo: "103",
          descricao: "Fanta Laranja 2L",
          quantidade: 4,
          valor_unitario: 7.5,
          valor_total: 30.0,
          _sourceTile: 1,
          _positionInTile: 1,
          _totalItemsInTile: 2,
        },
      ];

      const consolidados = deduplicateAndConsolidateItems(itensComOverlap);
      expect(consolidados.length).toBe(3);
      expect(consolidados[1].descricao).toBe("Monster Mango Loco 473ml");
      expect(consolidados[2].descricao).toBe("Fanta Laranja 2L");
    });

    it("Teste 6 — Duas linhas legítimas idênticas fora da fronteira de overlap NÃO devem ser apagadas", () => {
      const duasLinhasReaisIdenticas: DanfeItemRaw[] = [
        // Linha 1 no Tile 0
        {
          codigo: "001",
          descricao: "COCA COLA 2L",
          unidade: "CX",
          quantidade: 5,
          valor_unitario: 50.0,
          valor_total: 250.0,
          _sourceTile: 0,
          _positionInTile: 0,
          _totalItemsInTile: 5,
        },
        {
          codigo: "002",
          descricao: "GUARANA 2L",
          unidade: "CX",
          quantidade: 2,
          valor_unitario: 40.0,
          valor_total: 80.0,
          _sourceTile: 0,
          _positionInTile: 1,
          _totalItemsInTile: 5,
        },
        // Linha 8 no final do Tile 1 (longe do overlap)
        {
          codigo: "001",
          descricao: "COCA COLA 2L",
          unidade: "CX",
          quantidade: 5,
          valor_unitario: 50.0,
          valor_total: 250.0,
          _sourceTile: 1,
          _positionInTile: 4,
          _totalItemsInTile: 5,
        },
      ];

      const consolidados = deduplicateAndConsolidateItems(duasLinhasReaisIdenticas);
      expect(consolidados.length).toBe(3); // Ambas as linhas de Coca-Cola 2L são preservadas!
    });
  });

  // ─── TESTE 7, 8 & 9: SEGURANÇA DE ESTOQUE E CUSTO UNITÁRIO DO PDV ───
  describe("7, 8 & 9. Proteção Rigorosa de Estoque e Custo do PDV", () => {
    it("Teste 7 — CX sem fator de conversão: status = pendente, estoque não altera e NUNCA grava R$ 50/UN no histórico de custo", () => {
      const itemCx: DanfeItemRaw = {
        descricao: "Coca Cola 2L Caixa",
        unidade: "CX",
        quantidade: 10,
        valor_unitario: 50.0,
        valor_total: 500.0,
      };

      const prodSemFator = { id: "eye-1", estoque_atual: 100, fator_conversao: null };
      const avaliacao = evaluateStockStatus(itemCx, prodSemFator);

      expect(avaliacao.status_estoque).toBe("pendente");
      expect(avaliacao.quantidadeParaEstoque).toBe(0);
      expect(avaliacao.custoUnitarioConvertido).toBeNull();
      expect(avaliacao.podeGravarHistoricoCusto).toBe(false);
      expect(avaliacao.motivoPendente).toContain("fator de conversão");
    });

    it("Teste 8 — CX com fator de conversão (6 un/cx): estoque += 60 e custo unitário = R$ 8,333...", () => {
      const itemCx: DanfeItemRaw = {
        descricao: "Coca Cola 2L Caixa com 6",
        unidade: "CX",
        quantidade: 10,
        valor_unitario: 50.0,
        valor_total: 500.0,
      };

      const prodComFator = { id: "eye-1", estoque_atual: 100, fator_conversao: 6 };
      const avaliacao = evaluateStockStatus(itemCx, prodComFator);

      expect(avaliacao.status_estoque).toBe("processado");
      expect(avaliacao.quantidadeParaEstoque).toBe(60);
      expect(avaliacao.custoUnitarioConvertido).toBeCloseTo(50 / 6, 4);
      expect(avaliacao.podeGravarHistoricoCusto).toBe(true);
    });

    it("Teste 9 — Produto não encontrado no Eyemobile: status = pendente, estoque não altera, custo não altera", () => {
      const itemNaoEncontrado: DanfeItemRaw = {
        descricao: "Bebida Especial Desconhecida",
        unidade: "UN",
        quantidade: 5,
        valor_unitario: 15.0,
        valor_total: 75.0,
      };

      const avaliacao = evaluateStockStatus(itemNaoEncontrado, null);

      expect(avaliacao.status_estoque).toBe("pendente");
      expect(avaliacao.quantidadeParaEstoque).toBe(0);
      expect(avaliacao.custoUnitarioConvertido).toBeNull();
      expect(avaliacao.podeGravarHistoricoCusto).toBe(false);
      expect(avaliacao.motivoPendente).toContain("não encontrado no cadastro");
    });
  });

  // ─── TESTE 10: VALIDAÇÃO MATEMÁTICA E PROTEÇÃO SERVER-SIDE ───
  describe("10. Validação Matemática e Status Requer Revisão", () => {
    it("Teste 10 — NF com divergência na soma dos itens deve resultar em status requer_revisao", () => {
      const itensIncompletos: DanfeItemRaw[] = [
        { codigo: "1", descricao: "Produto A", quantidade: 10, valor_unitario: 5.0, valor_total: 50.0 },
      ];

      const resultado = validateDanfeMath(itensIncompletos, { valor_produtos: 250.0, valor_total_nf: 260.0 });

      expect(resultado.valido).toBe(false);
      expect(resultado.status).toBe("requer_revisao");
      expect(resultado.diferenca).toBe(200.0);
      expect(resultado.motivo).toContain("diverge");
    });

    it("NF com leitura matemática perfeita deve ser aprovada como valido", () => {
      const itensPerfeitos: DanfeItemRaw[] = [
        { codigo: "1", descricao: "Produto A", quantidade: 10, valor_unitario: 5.0, valor_total: 50.0 },
        { codigo: "2", descricao: "Produto B", quantidade: 5, valor_unitario: 20.0, valor_total: 100.0 },
      ];

      const resultado = validateDanfeMath(itensPerfeitos, { valor_produtos: 150.0, valor_total_nf: 160.0 });

      expect(resultado.valido).toBe(true);
      expect(resultado.status).toBe("valido");
      expect(resultado.diferenca).toBe(0.0);
    });
  });
});
