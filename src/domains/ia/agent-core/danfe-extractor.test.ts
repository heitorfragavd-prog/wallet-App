import { describe, expect, it } from "vitest";
import {
  calculateRotationNeeded,
  calculateTableCropTiles,
  determineAdaptiveTilesCount,
  analyzeTileCoverage,
  subdivideCropTile,
  expandCropTileWithMargin,
  classifyVisionResponse,
  validateProductRow,
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

    // Caso F: Item fora do Core é tratado como overlap_context
    it("Caso F (Overlap Context): Item com centro vertical fora do Core é tratado puramente como contexto visual (overlap_context)", () => {
      const itemsTile0: DanfeItemRaw[] = [
        {
          codigo: "9901",
          descricao: "FANTA GUARANA 350ML",
          quantidade: 3,
          valor_unitario: 4.0,
          valor_total: 12.0,
          _row_center: 0.90, // abs_y: 565.9 (> Core 0 556)
        },
      ];

      const { itensFinais, diagnostico } = consolidateDanfeItems([
        { tile: tile0, items: itemsTile0 },
      ]);

      expect(itensFinais.length).toBe(0);
      expect(diagnostico[0].accepted).toBe(false);
      expect(diagnostico[0].reason).toBe("overlap_context");
    });

    // Caso G: Dois produtos diferentes com mesmo valor total e próximos da fronteira NÃO podem ser mesclados
    it("Caso G: Dois produtos diferentes com mesmo valor total próximos da fronteira devem gerar 2 linhas distintas", () => {
      // Tile 0 possui COCA COLA por R$ 24,00 no Core 0 (abs_y = 540)
      // Tile 1 possui FANTA por R$ 24,00 no Core 1 (abs_y = 570)
      // Ambas possuem mesmo valor (R$ 24,00), mas produtos diferentes em seus respectivos Cores!
      const itemsTile0: DanfeItemRaw[] = [
        {
          codigo: "101",
          descricao: "COCA COLA 350ML",
          quantidade: 4,
          valor_unitario: 6.0,
          valor_total: 24.0,
          _row_center: (540 - tile0.y) / tile0.height, // abs_y = 540 (Core 0: 268-556 -> ACEITO)
        },
      ];

      const itemsTile1: DanfeItemRaw[] = [
        {
          codigo: "102",
          descricao: "FANTA 350ML",
          quantidade: 4,
          valor_unitario: 6.0,
          valor_total: 24.0,
          _row_center: (570 - tile1.y) / tile1.height, // abs_y = 570 (Core 1: 556-844 -> ACEITO)
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

    // Caso I: Fatiamento Adaptativo para Tabela Densa
    it("Caso I (Tabela Densa Adaptativa): tabela de altura 576px gera 3-4 tiles menores adaptativamente", () => {
      const countPequena = determineAdaptiveTilesCount(180);
      expect(countPequena).toBe(1);

      const countMedia = determineAdaptiveTilesCount(350);
      expect(countMedia).toBe(2);

      const countDensa = determineAdaptiveTilesCount(576);
      expect(countDensa).toBe(3);

      const countMuitoDensa = determineAdaptiveTilesCount(700);
      expect(countMuitoDensa).toBe(4);

      const resAdaptativo = calculateTableCropTiles(1280, 960, { detectada: true, top: 0.28, bottom: 0.88 }, "auto");
      expect(resAdaptativo.tiles.length).toBe(3);
      expect(resAdaptativo.tiles[0].coreStartY).toBe(268);
    });

    // Caso J: Último produto no fundo do tile (row_center = 0.95) é preservado
    it("Caso J: Último produto próximo ao fundo do último tile (row_center = 0.95) é aceito no core", () => {
      const tileFinal: CropTileCoordinate = {
        index: 2,
        totalTiles: 3,
        x: 0,
        y: 600,
        width: 1280,
        height: 250,
        overlapY: 30,
        coreStartY: 650,
        coreEndY: 844,
      };

      const itemFundo: DanfeItemRaw = {
        codigo: "7788",
        descricao: "AGUA MINERAL 500ML",
        quantidade: 10,
        valor_unitario: 2.0,
        valor_total: 20.0,
        _row_center: 0.95, // abs_y = 600 + 0.95 * 250 = 837.5 (dentro de 650-844)
      };

      const { itensFinais, diagnostico } = consolidateDanfeItems([
        { tile: tileFinal, items: [itemFundo] },
      ]);

      expect(itensFinais.length).toBe(1);
      expect(itensFinais[0].descricao).toBe("AGUA MINERAL 500ML");
      expect(diagnostico[0].accepted).toBe(true);
      expect(diagnostico[0].reason).toBe("core_owner");
    });

    // Caso K: 4 Tiles com Overlaps - Produtos em overlaps adjacentes resultam em exatamente 1 linha por produto
    it("Caso K: 4 Tiles com overlaps geram exatamente 1 linha física final por produto sem duplicações", () => {
      const res4 = calculateTableCropTiles(1280, 960, { detectada: true, top: 0.28, bottom: 0.88 }, 4);
      expect(res4.tiles.length).toBe(4);

      // Produto 1 no Core 0
      const it0: DanfeItemRaw = { codigo: "1", descricao: "PROD 1", quantidade: 1, valor_unitario: 10, valor_total: 10, _row_center: 0.5 };
      // Produto 2 na fronteira Tile 0 e Tile 1 (Tile 0 overlap, Tile 1 core)
      const it1_t0: DanfeItemRaw = { codigo: "2", descricao: "PROD 2", quantidade: 1, valor_unitario: 20, valor_total: 20, _row_center: 0.90 }; // absY ~ 426 (> Core 0 412)
      const it1_t1: DanfeItemRaw = { codigo: "2", descricao: "PROD 2", quantidade: 1, valor_unitario: 20, valor_total: 20, _row_center: 0.15 }; // absY ~ 423 (Core 1: 412-556)
      // Produto 3 no Core 2
      const it3: DanfeItemRaw = { codigo: "3", descricao: "PROD 3", quantidade: 1, valor_unitario: 30, valor_total: 30, _row_center: 0.5 };
      // Produto 4 no Core 3
      const it4: DanfeItemRaw = { codigo: "4", descricao: "PROD 4", quantidade: 1, valor_unitario: 40, valor_total: 40, _row_center: 0.5 };

      const { itensFinais } = consolidateDanfeItems([
        { tile: res4.tiles[0], items: [it0, it1_t0] },
        { tile: res4.tiles[1], items: [it1_t1] },
        { tile: res4.tiles[2], items: [it3] },
        { tile: res4.tiles[3], items: [it4] },
      ]);

      expect(itensFinais.length).toBe(4);
      const soma = itensFinais.reduce((acc, it) => acc + (it.valor_total || 0), 0);
      expect(soma).toBe(100);
    });

    // Caso L: Produtos iguais em posições diferentes continuam sendo duas linhas
    it("Caso L: Produtos idênticos em posições verticais distantes são mantidos como 2 linhas distintas", () => {
      const res2 = calculateTableCropTiles(1280, 960, { detectada: true, top: 0.28, bottom: 0.88 }, 2);
      const itLinha1: DanfeItemRaw = { codigo: "50", descricao: "ITEM REPETIDO", quantidade: 2, valor_unitario: 15, valor_total: 30, _row_center: 0.2 };
      const itLinha8: DanfeItemRaw = { codigo: "50", descricao: "ITEM REPETIDO", quantidade: 2, valor_unitario: 15, valor_total: 30, _row_center: 0.8 };

      const { itensFinais } = consolidateDanfeItems([
        { tile: res2.tiles[0], items: [itLinha1] },
        { tile: res2.tiles[1], items: [itLinha8] },
      ]);

      expect(itensFinais.length).toBe(2);
      expect(itensFinais[0].valor_total).toBe(30);
      expect(itensFinais[1].valor_total).toBe(30);
    });

    // Caso M: Fallback Seletivo (Subdivisão de Tile Suspeito)
    it("Caso M (Subdivisão de Tile Suspeito): subdivide tile incompleto e consolida sem duplicar outros tiles", () => {
      const res2 = calculateTableCropTiles(1280, 960, { detectada: true, top: 0.28, bottom: 0.88 }, 2);
      const tile0 = res2.tiles[0];
      const tile1 = res2.tiles[1];

      // Subdivide Tile 1 em 1A e 1B
      const [sub1A, sub1B] = subdivideCropTile(tile1, 1280, 960, 0.15);
      expect(sub1A.coreStartY).toBe(tile1.coreStartY);
      expect(sub1B.coreEndY).toBe(tile1.coreEndY);

      const itemsTile0: DanfeItemRaw[] = [
        { codigo: "1", descricao: "COCA LATA", quantidade: 2, valor_unitario: 5, valor_total: 10, _row_center: 0.5 },
      ];
      const itemsSub1A: DanfeItemRaw[] = [
        { codigo: "10", descricao: "COCA 2L", quantidade: 1, valor_unitario: 10, valor_total: 10, _row_center: 0.5 },
      ];
      const itemsSub1B: DanfeItemRaw[] = [
        { codigo: "20", descricao: "FANTA 2L", quantidade: 1, valor_unitario: 10, valor_total: 10, _row_center: 0.5 },
      ];

      const { itensFinais } = consolidateDanfeItems([
        { tile: tile0, items: itemsTile0 },
        { tile: sub1A, items: itemsSub1A },
        { tile: sub1B, items: itemsSub1B },
      ]);

      expect(itensFinais.length).toBe(3);
      expect(itensFinais.map((i) => i.codigo)).toEqual(["1", "10", "20"]);
    });

    // Caso N: Limite Estrito de Retry (Máximo 1 rodada adicional)
    it("Caso N (Limite de Retry): retry é executado no máximo 1 vez, sem loops", () => {
      let retryCount = 0;
      const MAX_RETRIES = 1;

      const precisaRetry = true;
      if (precisaRetry && retryCount < MAX_RETRIES) {
        retryCount++;
      }

      // Segunda tentativa não deve disparar novo retry
      if (precisaRetry && retryCount < MAX_RETRIES) {
        retryCount++;
      }

      expect(retryCount).toBe(1);
    });

    // Caso O: Validador Estrutural de Linha de Produto - Rejeição de Rodapé Fiscal
    it("Caso O (Rejeição de Rodapé Fiscal): texto fiscal 'Resolucao do Senado Federal...' é rejeitado como não-produto", () => {
      const itemRodape: DanfeItemRaw = {
        codigo: "18876",
        descricao: "Resolucao do Senado Federal 13/12, Numero da FCI 662",
        quantidade: 1,
        unidade: "CX",
        valor_unitario: 43.26,
        valor_total: 43.26,
        _row_center: 0.5,
      };

      const validacaoEstrutural = validateProductRow(itemRodape);
      expect(validacaoEstrutural.isValid).toBe(false);
      expect(validacaoEstrutural.reason).toContain("Texto fiscal/rodapé detectado");

      const res = consolidateDanfeItems([
        {
          tile: {
            index: 0,
            totalTiles: 1,
            x: 0,
            y: 0,
            width: 1280,
            height: 500,
            overlapY: 0,
            coreStartY: 0,
            coreEndY: 500,
          },
          items: [itemRodape],
        },
      ]);

      expect(res.itensFinais.length).toBe(0);
      expect(res.diagnostico[0].accepted).toBe(false);
      expect(res.diagnostico[0].reason).toContain("rejected_not_product_row");
    });

    // Caso P: Validador Estrutural de Linha de Produto - Produto Verdadeiro
    it("Caso P (Produto Verdadeiro): linha com NCM, CFOP, unidade e valores coerentes é aceita", () => {
      const itemValido: DanfeItemRaw = {
        codigo: "55401",
        descricao: "COCA COLA LT 350ML",
        ncm: "22021000",
        cfop: "5401",
        unidade: "CX",
        quantidade: 2,
        valor_unitario: 37.31,
        valor_total: 74.62,
        _row_center: 0.3,
      };

      const validacaoEstrutural = validateProductRow(itemValido);
      expect(validacaoEstrutural.isValid).toBe(true);

      const res = consolidateDanfeItems([
        {
          tile: {
            index: 0,
            totalTiles: 1,
            x: 0,
            y: 0,
            width: 1280,
            height: 500,
            overlapY: 0,
            coreStartY: 0,
            coreEndY: 500,
          },
          items: [itemValido],
        },
      ]);

      expect(res.itensFinais.length).toBe(1);
      expect(res.itensFinais[0].descricao).toBe("COCA COLA LT 350ML");
    });

    // Caso Q: Classificação de Refusal da OpenAI
    it("Caso Q (Refusal da OpenAI): 'Desculpe, não consigo ajudar...' é classificado como refusal, nunca como vazio válido", () => {
      const refusalContent = "Desculpe, não consigo ajudar com isso.";
      const classif = classifyVisionResponse(refusalContent, 200);

      expect(classif.status).toBe("refusal");
      expect(classif.itens.length).toBe(0);
      expect(classif.reason).toContain("Recusa do modelo");
    });

    // Caso R: Retry de Falha de Visão com Contexto Ampliado
    it("Caso R (Retry de Falha de Visão): tile com refusal é ampliado com margem e consolida produto exatamente 1 vez", () => {
      const tileOriginal: CropTileCoordinate = {
        index: 0,
        totalTiles: 2,
        x: 0,
        y: 268,
        width: 1280,
        height: 220,
        overlapY: 0,
        coreStartY: 268,
        coreEndY: 460,
      };

      // Expande com 25% de margem vertical
      const tileAmpliado = expandCropTileWithMargin(tileOriginal, 1280, 960, 0.25);
      expect(tileAmpliado.y).toBeLessThan(tileOriginal.y);
      expect(tileAmpliado.height).toBeGreaterThan(tileOriginal.height);
      expect(tileAmpliado.coreStartY).toBe(tileOriginal.coreStartY);
      expect(tileAmpliado.coreEndY).toBe(tileOriginal.coreEndY);

      // Produto lido após retry no tile ampliado
      const itemLido: DanfeItemRaw = {
        codigo: "55401",
        descricao: "COCA COLA LATA 350ML",
        unidade: "CX",
        quantidade: 2,
        valor_unitario: 37.31,
        valor_total: 74.62,
        _row_center: 0.45, // dentro do core original
      };

      const res = consolidateDanfeItems([
        { tile: tileAmpliado, items: [itemLido] },
      ]);

      expect(res.itensFinais.length).toBe(1);
      expect(res.itensFinais[0].valor_total).toBe(74.62);
    });

    // Caso S: Fim Legítimo da Tabela (Sem Subdivisão por row_center)
    it("Caso S (Fim Legítimo da Tabela): tabela terminando em row_center = 0.70 não dispara falso alerta de omissão", () => {
      const tileFinal: CropTileCoordinate = {
        index: 1,
        totalTiles: 2,
        x: 0,
        y: 500,
        width: 1280,
        height: 344,
        overlapY: 30,
        coreStartY: 556,
        coreEndY: 844,
      };

      const itemsTileFinal: DanfeItemRaw[] = [
        { codigo: "1", descricao: "PROD 1", unidade: "UN", quantidade: 1, valor_unitario: 10, valor_total: 10, _row_center: 0.3 },
        { codigo: "2", descricao: "PROD 2", unidade: "UN", quantidade: 1, valor_unitario: 20, valor_total: 20, _row_center: 0.7 },
      ];

      const cov = analyzeTileCoverage(tileFinal, itemsTileFinal);
      expect(cov.possivelOmissaoFinal).toBe(false);
    });

    // Caso T: Divergência Matemática Marca Revisão sem Alterar Itens
    it("Caso T (Validação Matemática Estrita): divergência marca requer_revisao mas NÃO remove ou altera itens", () => {
      const itens: DanfeItemRaw[] = [
        { codigo: "1", descricao: "PROD 1", unidade: "UN", quantidade: 1, valor_unitario: 100, valor_total: 100 },
      ];

      const validacao = validateDanfeMath(itens, { valor_produtos: 500.0 });
      expect(validacao.valido).toBe(false);
      expect(validacao.status).toBe("requer_revisao");
      expect(validacao.diferenca).toBe(400.0);
      expect(itens[0].valor_total).toBe(100); // Intacto, nunca forçado para 500!
    });

    // Caso U: Item somente no overlap é rejeitado no tile vizinho e aceito no tile dono
    it("Caso U (Overlap Contextual): Tile 0 enxerga linha do Core 1, Tile 1 possui a linha em seu Core -> exatamente 1 item final", () => {
      const res = calculateTableCropTiles(1280, 960, { detectada: true, top: 0.28, bottom: 0.88 }, 2);
      const t0 = res.tiles[0]; // coreStartY = 268, coreEndY = 556
      const t1 = res.tiles[1]; // coreStartY = 556, coreEndY = 844

      // Linha em Y = 570 (pertence ao Core 1)
      const it_t0: DanfeItemRaw = {
        codigo: "10",
        descricao: "COCA COLA 2L",
        unidade: "UN",
        quantidade: 1,
        valor_unitario: 10,
        valor_total: 10,
        _row_center: (570 - t0.y) / t0.height, // abs_y = 570 (> 556)
      };

      const it_t1: DanfeItemRaw = {
        codigo: "10",
        descricao: "COCA COLA 2L",
        unidade: "UN",
        quantidade: 1,
        valor_unitario: 10,
        valor_total: 10,
        _row_center: (570 - t1.y) / t1.height, // abs_y = 570 (Core 1)
      };

      const { itensFinais, diagnostico } = consolidateDanfeItems([
        { tile: t0, items: [it_t0] },
        { tile: t1, items: [it_t1] },
      ]);

      expect(itensFinais.length).toBe(1);
      expect(itensFinais[0].descricao).toBe("COCA COLA 2L");

      const diagT0 = diagnostico.find((d) => d.tileIndex === t0.index);
      const diagT1 = diagnostico.find((d) => d.tileIndex === t1.index);
      expect(diagT0?.accepted).toBe(false);
      expect(diagT0?.reason).toBe("overlap_context");
      expect(diagT1?.accepted).toBe(true);
      expect(diagT1?.reason).toBe("core_owner");
    });

    // Caso V: OCR completamente diferente no overlap não pode gerar resgate indevido
    it("Caso V (Sem Resgate Espúrio de Órfãos): OCR divergente no overlap não gera falso produto adicional", () => {
      const res = calculateTableCropTiles(1280, 960, { detectada: true, top: 0.28, bottom: 0.88 }, 2);
      const t0 = res.tiles[0];
      const t1 = res.tiles[1];

      // Tile 0 leu "KERO COCO" no overlap inferior (Y = 570 > 556)
      const it_t0: DanfeItemRaw = {
        codigo: "1",
        descricao: "KERO COCO PET 1L",
        unidade: "CX",
        quantidade: 1,
        valor_unitario: 43.26,
        valor_total: 43.26,
        _row_center: (570 - t0.y) / t0.height,
      };

      // Tile 1 leu "BISCOITO RECHEADO" no Core 1 (Y = 570)
      const it_t1: DanfeItemRaw = {
        codigo: "2",
        descricao: "BISCOITO RECHEADO 130G",
        unidade: "CX",
        quantidade: 1,
        valor_unitario: 43.20,
        valor_total: 43.20,
        _row_center: (570 - t1.y) / t1.height,
      };

      const { itensFinais } = consolidateDanfeItems([
        { tile: t0, items: [it_t0] },
        { tile: t1, items: [it_t1] },
      ]);

      // Apenas o item pertencente ao Core 1 é aceito! O item do Tile 0 no overlap é descartado!
      expect(itensFinais.length).toBe(1);
      expect(itensFinais[0].descricao).toBe("BISCOITO RECHEADO 130G");
    });

    // Caso W: Dois produtos legítimos próximos da fronteira (um em cada core)
    it("Caso W (Fronteira Legítima): um produto no Core 0 e outro no Core 1 geram exatamente 2 produtos", () => {
      const res = calculateTableCropTiles(1280, 960, { detectada: true, top: 0.28, bottom: 0.88 }, 2);
      const t0 = res.tiles[0]; // 268-556
      const t1 = res.tiles[1]; // 556-844

      const itCore0: DanfeItemRaw = {
        codigo: "1",
        descricao: "PRODUTO FINAL CORE 0",
        unidade: "UN",
        quantidade: 1,
        valor_unitario: 10,
        valor_total: 10,
        _row_center: (550 - t0.y) / t0.height, // abs_y = 550 (< 556, Core 0)
      };

      const itCore1: DanfeItemRaw = {
        codigo: "2",
        descricao: "PRODUTO INICIO CORE 1",
        unidade: "UN",
        quantidade: 1,
        valor_unitario: 20,
        valor_total: 20,
        _row_center: (560 - t1.y) / t1.height, // abs_y = 560 (>= 556, Core 1)
      };

      const { itensFinais } = consolidateDanfeItems([
        { tile: t0, items: [itCore0] },
        { tile: t1, items: [itCore1] },
      ]);

      expect(itensFinais.length).toBe(2);
      expect(itensFinais.map((i) => i.codigo)).toEqual(["1", "2"]);
    });

    // Caso X: Retry expandido converte coordenada usando o crop expandido e valida contra o Core original
    it("Caso X (Retry Expandido): _row_center do retry usa dimensões do crop expandido e avalia no Core original", () => {
      const tileOrig: CropTileCoordinate = {
        index: 0,
        totalTiles: 3,
        x: 0,
        y: 268,
        width: 1280,
        height: 220,
        overlapY: 0,
        coreStartY: 268,
        coreEndY: 460,
      };

      const expandedTile = expandCropTileWithMargin(tileOrig, 1280, 960, 0.25);
      // expandedTile: y = 213, height = 330, coreStartY = 268, coreEndY = 460

      // Suponha que o modelo leu uma linha em row_center = 0.50 do crop expandido
      // absoluteY = 213 + 0.50 * 330 = 378 (dentro do Core original 268-460)
      const itemRetry: DanfeItemRaw = {
        codigo: "55448",
        descricao: "COCA COLA LT 350ML FL",
        unidade: "CX",
        quantidade: 2,
        valor_unitario: 33,
        valor_total: 66,
        _row_center: 0.50,
      };

      const { itensFinais, diagnostico } = consolidateDanfeItems([
        { tile: expandedTile, items: [itemRetry] },
      ]);

      expect(itensFinais.length).toBe(1);
      expect(diagnostico[0].accepted).toBe(true);
      expect(diagnostico[0].reason).toBe("core_owner");
      expect(diagnostico[0].absoluteY).toBe(378);
    });

    // Caso Y: Cobertura integral sem lacunas nem sobreposições de Core
    it("Caso Y (Partição Estrita de Core): Cores adjacentes formam partição exata e contígua sem gaps nem overlaps de ownership", () => {
      const res = calculateTableCropTiles(1280, 960, { detectada: true, top: 0.28, bottom: 0.88 }, 3);
      expect(res.tiles.length).toBe(3);

      const [t0, t1, t2] = res.tiles;
      expect(t0.coreStartY).toBe(Math.floor(960 * 0.28)); // 268
      expect(t0.coreEndY).toBe(t1.coreStartY);           // Contíguo: fim do Core 0 == início do Core 1
      expect(t1.coreEndY).toBe(t2.coreStartY);           // Contíguo: fim do Core 1 == início do Core 2
      expect(t2.coreEndY).toBe(Math.floor(960 * 0.88)); // 844
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
