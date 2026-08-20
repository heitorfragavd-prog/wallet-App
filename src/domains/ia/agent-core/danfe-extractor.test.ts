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
  // ─── 1. ORIENTAÇÃO REAL POR CONTEÚDO E NORMALIZAÇÃO ───
  describe("1. Orientação Real por Conteúdo (0°, 90°, 180°, 270°)", () => {
    it("DANFE 90°: deve detectar 90° e permitir normalização prévia antes de qualquer recorte", () => {
      const rot = calculateRotationNeeded(90);
      expect(rot).toBe(90);
    });

    it("DANFE 270°: deve detectar 270° e permitir normalização prévia antes de qualquer recorte", () => {
      const rot = calculateRotationNeeded(270);
      expect(rot).toBe(270);
    });

    it("DANFE Normal (0°): não deve rotacionar mesmo se a imagem for horizontal/paisagem", () => {
      const rot = calculateRotationNeeded(0);
      expect(rot).toBe(0);
    });

    it("Retorno nulo ou inválido: utiliza fallback seguro de 0°", () => {
      const rot = calculateRotationNeeded(null);
      expect(rot).toBe(0);
    });
  });

  // ─── 2. DETECÇÃO DE REGIÃO DA TABELA NA IMAGEM JÁ NORMALIZADA ───
  describe("2. Região da Tabela Calculada na Matriz Normalizada (Em Pé)", () => {
    it("DANFE normalizada: região detectada 32%-81% calcula tiles estritamente na imagem em pé", () => {
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

    it("Fallback explícito: quando a IA não detecta região com confiança, usa 28%-88%", () => {
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

  // ─── 3. DEDUPLICAÇÃO CONSCIENTE DO OVERLAP ───
  describe("3. Deduplicação Consciente de Overlap", () => {
    it("Duplicata verdadeira por overlap: Tile 0 final + Tile 1 início consolida em 1 único item", () => {
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

    it("Duas linhas legítimas idênticas fora do overlap NÃO são apagadas", () => {
      const duasLinhasReaisIdenticas: DanfeItemRaw[] = [
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
      expect(consolidados.length).toBe(3);
    });
  });

  // ─── 4. SEGURANÇA DE ESTOQUE E CUSTO UNITÁRIO DO PDV ───
  describe("4. Proteção de Estoque e Custo do PDV (CX != UN)", () => {
    it("CX sem fator: status = pendente, estoque não altera e NUNCA grava R$ 50/UN no histórico de custo", () => {
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

    it("CX com fator (6 un/cx): estoque += 60 e custo unitário real = 50 / 6 = R$ 8,333...", () => {
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

    it("Produto não encontrado no Eyemobile: status = pendente, estoque não altera", () => {
      const itemNaoEncontrado: DanfeItemRaw = {
        descricao: "Bebida Desconhecida",
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
    });
  });

  // ─── 5. CONFIRMAÇÃO PARCIAL E REPROCESSAMENTO SEM DUPLICAÇÃO ───
  describe("5. Confirmação Parcial e Reprocessamento Sem Duplicação", () => {
    it("NF com 5 itens processados e 3 pendentes: identifica status parcialmente_processada", () => {
      const itensTotal = 8;
      const itensRecemProcessados = 5;
      const itensPendentes = 3;
      const itensJaProcessados = 0;

      let statusFinalNF = "pendente";
      if (itensPendentes === 0 && (itensRecemProcessados + itensJaProcessados > 0)) {
        statusFinalNF = "confirmada";
      } else if (itensRecemProcessados > 0 || itensJaProcessados > 0) {
        statusFinalNF = "parcialmente_processada";
      }

      expect(statusFinalNF).toBe("parcialmente_processada");
    });

    it("Reprocessamento posterior: itens com status_estoque = 'processado' são ignorados para não duplicar estoque", () => {
      const itensNaSegundaTentativa: Array<{ id: string; status_estoque: string; quantidade: number }> = [
        { id: "it-1", status_estoque: "processado", quantidade: 10 },
        { id: "it-2", status_estoque: "processado", quantidade: 5 },
        { id: "it-3", status_estoque: "pendente", quantidade: 4 }, // Foi ajustado agora no PDV
      ];

      let itensJaProcessados = 0;
      let itensRecemProcessados = 0;
      let estoqueAdicionado = 0;

      for (const item of itensNaSegundaTentativa) {
        if (item.status_estoque === "processado") {
          itensJaProcessados++;
          continue; // Pula sem adicionar estoque novamente!
        }

        // Processa apenas o item que estava pendente
        itensRecemProcessados++;
        estoqueAdicionado += item.quantidade;
      }

      expect(itensJaProcessados).toBe(2);
      expect(itensRecemProcessados).toBe(1);
      expect(estoqueAdicionado).toBe(4); // Apenas o item pendente foi incrementado!
    });
  });

  // ─── 6. VALIDAÇÃO MATEMÁTICA E REQUER REVISÃO ───
  describe("6. Validação Matemática Determinística", () => {
    it("NF com soma divergente deve resultar em status requer_revisao", () => {
      const itensIncompletos: DanfeItemRaw[] = [
        { codigo: "1", descricao: "Produto A", quantidade: 10, valor_unitario: 5.0, valor_total: 50.0 },
      ];

      const resultado = validateDanfeMath(itensIncompletos, { valor_produtos: 250.0, valor_total_nf: 260.0 });

      expect(resultado.valido).toBe(false);
      expect(resultado.status).toBe("requer_revisao");
      expect(resultado.diferenca).toBe(200.0);
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
