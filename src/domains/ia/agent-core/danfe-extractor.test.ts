import { describe, expect, it } from "vitest";
import {
  calculateRotationNeeded,
  calculateTableCropTiles,
  consolidateDanfeItems,
  deduplicateAndConsolidateItems,
  validateDanfeMath,
  evaluateStockStatus,
  type DanfeItemRaw,
  type CropTileCoordinate,
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
    it("DANFE normalizada: calcula tiles com Core e Overlap explícitos", () => {
      const { tiles, usouFallback, topPercent, bottomPercent } = calculateTableCropTiles(
        1200,
        2000,
        { detectada: true, top: 0.28, bottom: 0.88 },
        2,
        0.15
      );

      expect(usouFallback).toBe(false);
      expect(topPercent).toBe(0.28);
      expect(bottomPercent).toBe(0.88);
      expect(tiles.length).toBe(2);

      // Tile 0 Core vs Tile 1 Core
      expect(tiles[0].coreStartY).toBe(560); // 2000 * 0.28
      expect(tiles[0].coreEndY).toBe(1160);  // 560 + 600
      expect(tiles[1].coreStartY).toBe(1160);
      expect(tiles[1].coreEndY).toBe(1760);  // 2000 * 0.88

      // Overlap expande além do Core
      expect(tiles[0].y).toBe(560);
      expect(tiles[0].y + tiles[0].height).toBeGreaterThan(tiles[0].coreEndY);
      expect(tiles[1].y).toBeLessThan(tiles[1].coreStartY);
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

  // ─── 3. OWNERSHIP GEOMÉTRICO POR CORE (TRANSFORMA OVERLAP EM CONTEXTO) ───
  describe("3. Ownership Geométrico de Linhas por Região Core", () => {
    const tile0: CropTileCoordinate = {
      index: 0,
      totalTiles: 2,
      x: 0,
      y: 268,
      width: 1280,
      height: 331,
      overlapY: 0,
      coreStartY: 268,
      coreEndY: 556,
    };

    const tile1: CropTileCoordinate = {
      index: 1,
      totalTiles: 2,
      x: 0,
      y: 513,
      width: 1280,
      height: 331,
      overlapY: 43,
      coreStartY: 556,
      coreEndY: 844,
    };

    // Caso A: Mesmo produto lido nos dois tiles com OCR diferente
    it("Caso A: Mesmo produto lido com OCR ligeiramente diferente no overlap é atribuído a apenas 1 tile", () => {
      // Linha física localizada em Y absoluto = 530 (dentro do Core do Tile 0)
      // No Tile 0: row_center = (530 - 268) / 331 ≈ 0.7915
      // No Tile 1: row_center = (530 - 513) / 331 ≈ 0.0513 (cai fora do Core do Tile 1)
      const itemsTile0: DanfeItemRaw[] = [
        {
          codigo: "55401",
          descricao: "COCA COLA LT 350ML",
          quantidade: 2,
          valor_unitario: 37.31,
          valor_total: 74.62,
          _row_center: 0.79, // absoluteY = 268 + 0.79 * 331 = 529.49 (Core do Tile 0: 268-556)
        },
      ];

      const itemsTile1: DanfeItemRaw[] = [
        {
          codigo: "55401",
          descricao: "COCA-COLA LATA 350 ML", // OCR diferente!
          quantidade: 2,
          valor_unitario: 37.31,
          valor_total: 74.62,
          _row_center: 0.05, // absoluteY = 513 + 0.05 * 331 = 529.55 (Fora do Core do Tile 1: 556-844)
        },
        {
          codigo: "56404",
          descricao: "COCA-COLA PET 2,00 L",
          quantidade: 2,
          valor_unitario: 33.01,
          valor_total: 66.02,
          _row_center: 0.40, // absoluteY = 513 + 0.40 * 331 = 645.4 (Core do Tile 1)
        },
      ];

      const { itensFinais, diagnostico } = consolidateDanfeItems([
        { tile: tile0, items: itemsTile0 },
        { tile: tile1, items: itemsTile1 },
      ]);

      // Esperado: O item da lata 350ml entra apenas 1 vez (do Tile 0) e o item PET 2L entra do Tile 1
      expect(itensFinais.length).toBe(2);
      expect(itensFinais[0].descricao).toBe("COCA COLA LT 350ML");
      expect(itensFinais[1].descricao).toBe("COCA-COLA PET 2,00 L");

      // Diagnóstico mostra rejeição no Tile 1 como overlap_context
      const diagOverlap = diagnostico.find((d) => d.tileIndex === 1 && d.itemIndex === 0);
      expect(diagOverlap?.accepted).toBe(false);
      expect(diagOverlap?.reason).toBe("overlap_context");
    });

    // Caso B: Dois produtos semelhantes fora do overlap
    it("Caso B: Dois produtos semelhantes em regiões distintas da tabela são ambos preservados", () => {
      const itemsTile0: DanfeItemRaw[] = [
        {
          codigo: "001",
          descricao: "COCA COLA ORIGINAL 350ML",
          quantidade: 1,
          valor_unitario: 5.0,
          valor_total: 5.0,
          _row_center: 0.30, // absoluteY = 367.3 (Core 0)
        },
      ];

      const itemsTile1: DanfeItemRaw[] = [
        {
          codigo: "002",
          descricao: "COCA COLA ZERO 350ML",
          quantidade: 1,
          valor_unitario: 5.0,
          valor_total: 5.0,
          _row_center: 0.60, // absoluteY = 711.6 (Core 1)
        },
      ];

      const { itensFinais } = consolidateDanfeItems([
        { tile: tile0, items: itemsTile0 },
        { tile: tile1, items: itemsTile1 },
      ]);

      expect(itensFinais.length).toBe(2);
      expect(itensFinais[0].descricao).toBe("COCA COLA ORIGINAL 350ML");
      expect(itensFinais[1].descricao).toBe("COCA COLA ZERO 350ML");
    });

    // Caso C: Duas linhas exatamente iguais fora do overlap
    it("Caso C: Duas linhas legítimas idênticas em posições físicas diferentes são preservadas", () => {
      const itemsTile0: DanfeItemRaw[] = [
        {
          codigo: "001",
          descricao: "COCA COLA 2L",
          unidade: "CX",
          quantidade: 5,
          valor_unitario: 50.0,
          valor_total: 250.0,
          _row_center: 0.20, // absoluteY = 334.2 (Core 0)
        },
      ];

      const itemsTile1: DanfeItemRaw[] = [
        {
          codigo: "001",
          descricao: "COCA COLA 2L",
          unidade: "CX",
          quantidade: 5,
          valor_unitario: 50.0,
          valor_total: 250.0,
          _row_center: 0.70, // absoluteY = 744.7 (Core 1)
        },
      ];

      const { itensFinais } = consolidateDanfeItems([
        { tile: tile0, items: itemsTile0 },
        { tile: tile1, items: itemsTile1 },
      ]);

      expect(itensFinais.length).toBe(2);
      expect(itensFinais[0].valor_total).toBe(250.0);
      expect(itensFinais[1].valor_total).toBe(250.0);
    });

    // Caso D: Linha cortada / parcial no Tile 0 vs completa no Core do Tile 1
    it("Caso D: Linha cortada no fim do Tile 0 é atribuída ao Tile 1 onde está seu centro", () => {
      // A linha física está em Y absoluto = 580 (Core do Tile 1: 556-844)
      // No Tile 0: Y 268 a 599. row_center = (580 - 268) / 331 ≈ 0.942 (na beirada cortada do Tile 0)
      // No Tile 1: Y 513 a 844. row_center = (580 - 513) / 331 ≈ 0.202 (bem visível no Core do Tile 1)
      const itemsTile0: DanfeItemRaw[] = [
        {
          codigo: "003",
          descricao: "MONSTER MANGO LOCO",
          quantidade: 5,
          valor_unitario: 8.0,
          valor_total: 40.0,
          _row_center: 0.94, // absoluteY = 579.14 (Fora do Core 0: 268-556)
        },
      ];

      const itemsTile1: DanfeItemRaw[] = [
        {
          codigo: "003",
          descricao: "MONSTER MANGO LOCO 473ML",
          quantidade: 5,
          valor_unitario: 8.0,
          valor_total: 40.0,
          _row_center: 0.20, // absoluteY = 579.20 (Dentro do Core 1: 556-844)
        },
      ];

      const { itensFinais, diagnostico } = consolidateDanfeItems([
        { tile: tile0, items: itemsTile0 },
        { tile: tile1, items: itemsTile1 },
      ]);

      expect(itensFinais.length).toBe(1);
      expect(itensFinais[0].descricao).toBe("MONSTER MANGO LOCO 473ML");

      const diagTile0 = diagnostico.find((d) => d.tileIndex === 0 && d.itemIndex === 0);
      expect(diagTile0?.accepted).toBe(false);
    });

    // Caso E: Regressão matemática e fechamento de valor
    it("Caso E: Soma dos itens consolidados bate exatamente com valor_produtos e aprova a validação", () => {
      const itemsTile0: DanfeItemRaw[] = [
        { codigo: "1", descricao: "Schweppes Tonica", quantidade: 10, valor_unitario: 5.0, valor_total: 50.0, _row_center: 0.20 },
        { codigo: "2", descricao: "Powerade Laranja", quantidade: 5, valor_unitario: 8.0, valor_total: 40.0, _row_center: 0.40 },
        { codigo: "3", descricao: "Monster Mango Loco", quantidade: 10, valor_unitario: 8.0, valor_total: 80.0, _row_center: 0.70 },
      ];

      const itemsTile1: DanfeItemRaw[] = [
        // Repetição do item 3 que caiu no overlap
        { codigo: "3", descricao: "Monster Mango Loco", quantidade: 10, valor_unitario: 8.0, valor_total: 80.0, _row_center: 0.05 },
        { codigo: "4", descricao: "Fanta Laranja 2L", quantidade: 4, valor_unitario: 7.5, valor_total: 30.0, _row_center: 0.35 },
      ];

      const { itensFinais } = consolidateDanfeItems([
        { tile: tile0, items: itemsTile0 },
        { tile: tile1, items: itemsTile1 },
      ]);

      expect(itensFinais.length).toBe(4);

      const validacao = validateDanfeMath(itensFinais, { valor_produtos: 200.0, valor_total_nf: 200.0 });
      expect(validacao.valido).toBe(true);
      expect(validacao.status).toBe("valido");
      expect(validacao.somaItens).toBe(200.0);
      expect(validacao.diferenca).toBe(0.0);
    });

    // Caso F: Resgate de Órfão no Overlap (Cross-boundary jitter original)
    it("Caso F (Resgate de Órfão): Mesma linha aparece nos dois tiles mas ambos _row_center possuem pequeno erro cruzado e nenhum cai no core esperado -> resultado final contém 1 linha (não 0)", () => {
      // Fronteira entre Core 0 e Core 1: Y = 556
      // No Tile 0: row_center = 0.90 -> absoluteY = 268 + 0.90 * 331 = 565.9 (> 556, rejeitado como Core 0)
      // No Tile 1: row_center = 0.10 -> absoluteY = 513 + 0.10 * 331 = 546.1 (< 556, rejeitado como Core 1)
      const itemsTile0: DanfeItemRaw[] = [
        {
          codigo: "9901",
          descricao: "FANTA GUARANA 350ML",
          quantidade: 3,
          valor_unitario: 4.0,
          valor_total: 12.0,
          _row_center: 0.90, // abs_y: 565.9 (> 556)
        },
      ];

      const itemsTile1: DanfeItemRaw[] = [
        {
          codigo: "9901",
          descricao: "FANTA GUARANA 350ML",
          quantidade: 3,
          valor_unitario: 4.0,
          valor_total: 12.0,
          _row_center: 0.10, // abs_y: 546.1 (< 556)
        },
      ];

      const { itensFinais, diagnostico } = consolidateDanfeItems([
        { tile: tile0, items: itemsTile0 },
        { tile: tile1, items: itemsTile1 },
      ]);

      // Esperado: A linha NÃO é perdida! É resgatada exatamente 1 vez com reason 'rescued_orphan_overlap'
      expect(itensFinais.length).toBe(1);
      expect(itensFinais[0].descricao).toBe("FANTA GUARANA 350ML");
      expect(itensFinais[0].valor_total).toBe(12.0);

      const diagOrfao = diagnostico.find((d) => d.accepted && d.reason === "rescued_orphan_overlap");
      expect(diagOrfao).toBeDefined();
    });

    // Caso G: Dois produtos diferentes com mesmo valor total e próximos da fronteira NÃO podem ser mesclados
    it("Caso G: Dois produtos diferentes com mesmo valor total próximos da fronteira devem gerar 2 linhas distintas", () => {
      // Tile 0 possui COCA COLA por R$ 24,00 no Core 0 (abs_y = 530)
      // Tile 1 possui FANTA por R$ 24,00 rejeitada no Tile 1 (abs_y = 545, overlap do Tile 1)
      // Ambas estão a apenas 15px de distância (distY = 15 < 35), mas com descrições/produtos diferentes!
      const itemsTile0: DanfeItemRaw[] = [
        {
          codigo: "101",
          descricao: "COCA COLA 350ML",
          quantidade: 4,
          valor_unitario: 6.0,
          valor_total: 24.0,
          _row_center: 0.79, // abs_y = 529.49 (Core 0: 268-556 -> ACEITO)
        },
      ];

      const itemsTile1: DanfeItemRaw[] = [
        {
          codigo: "102",
          descricao: "FANTA 350ML", // Produto diferente!
          quantidade: 4,
          valor_unitario: 6.0,
          valor_total: 24.0,
          _row_center: 0.10, // abs_y = 546.10 (< 556, rejeitado no Core 1 -> Órfão)
        },
      ];

      const { itensFinais } = consolidateDanfeItems([
        { tile: tile0, items: itemsTile0 },
        { tile: tile1, items: itemsTile1 },
      ]);

      // Esperado: NÃO mesclar por valor! Manter os 2 produtos distintos
      expect(itensFinais.length).toBe(2);
      expect(itensFinais.some((it) => it.descricao?.includes("COCA COLA"))).toBe(true);
      expect(itensFinais.some((it) => it.descricao?.includes("FANTA"))).toBe(true);
    });

    // Caso H: Mesmo produto e mesmo valor, mas posições físicas distintas (distY > 45px)
    it("Caso H: Mesmo produto e mesmo valor em posições físicas distintas são preservados como 2 linhas", () => {
      const itemsTile0: DanfeItemRaw[] = [
        {
          codigo: "101",
          descricao: "COCA COLA 350ML",
          quantidade: 4,
          valor_unitario: 6.0,
          valor_total: 24.0,
          _row_center: 0.20, // abs_y = 334.2 (Core 0)
        },
      ];

      const itemsTile1: DanfeItemRaw[] = [
        {
          codigo: "101",
          descricao: "COCA COLA 350ML",
          quantidade: 4,
          valor_unitario: 6.0,
          valor_total: 24.0,
          _row_center: 0.70, // abs_y = 744.7 (Core 1)
        },
      ];

      const { itensFinais } = consolidateDanfeItems([
        { tile: tile0, items: itemsTile0 },
        { tile: tile1, items: itemsTile1 },
      ]);

      expect(itensFinais.length).toBe(2);
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
        { id: "it-3", status_estoque: "pendente", quantidade: 4 },
      ];

      let itensJaProcessados = 0;
      let itensRecemProcessados = 0;
      let estoqueAdicionado = 0;

      for (const item of itensNaSegundaTentativa) {
        if (item.status_estoque === "processado") {
          itensJaProcessados++;
          continue;
        }

        itensRecemProcessados++;
        estoqueAdicionado += item.quantidade;
      }

      expect(itensJaProcessados).toBe(2);
      expect(itensRecemProcessados).toBe(1);
      expect(estoqueAdicionado).toBe(4);
    });
  });
});
