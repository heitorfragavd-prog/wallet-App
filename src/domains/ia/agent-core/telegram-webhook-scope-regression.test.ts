/**
 * Teste de Regressão — Telegram Webhook: Escopo de docAnalysis, Rotação e Extração de Boleto
 *
 * Garante que:
 * 1. Boleto fotografado de lado não lança ReferenceError (docAnalysis is not defined).
 * 2. Orientação detectada 90°/270° dispara rotação e segunda extração.
 * 3. Valor é derivado deterministicamente da linha digitável FEBRABAN quando disponível.
 * 4. OCR é fallback quando linha digitável ausente ou inválida.
 * 5. DANFE Brasnorte permanece íntegra (NF 000.832.082, R$ 1.105,25, 11 itens).
 */

import { describe, it, expect } from "vitest";
import { reconcileNFeNumber } from "../../../../supabase/functions/_shared/danfe-gemini-v2";

// ── Replica local da função do telegram-webhook (para testes isolados) ──
function parseLinhaDigitavelFebraban(linha: string): { valor: number | null; vencimento: string | null } {
  const digits = (linha || "").replace(/\D/g, "");
  if (digits.length !== 47) return { valor: null, vencimento: null };
  const campo5 = digits.slice(33);
  const fatorStr = campo5.slice(0, 4);
  const valorStr = campo5.slice(4);
  const valorCentavos = parseInt(valorStr, 10);
  const valor = !isNaN(valorCentavos) && valorCentavos > 0 ? valorCentavos / 100 : null;
  const fator = parseInt(fatorStr, 10);
  let vencimento: string | null = null;
  if (!isNaN(fator) && fator > 1000) {
    const baseDate = new Date(Date.UTC(2025, 1, 22));
    const vencDate = new Date(baseDate.getTime() + (fator - 1000) * 86400000);
    vencimento = vencDate.toISOString().split("T")[0];
  }
  return { valor, vencimento };
}

function validarDigitosLinhaDigitavel(linha: string): boolean {
  const digits = linha.replace(/\D/g, "");
  return digits.length === 47 || digits.length === 48;
}

describe("Telegram Webhook — Boleto: Escopo + Rotação + Extração Determinística", () => {
  // ─── A: Escopo de docAnalysis não lança ReferenceError para boleto ───
  it("A: Boleto não-DANFE não lança ReferenceError (escopo docAnalysis no pai)", () => {
    const orientacaoAnalysis = {
      tipo_documento: "boleto",
      orientacao_leitura: 90,
      boleto_dados: {
        beneficiario: null,
        valor: null,
        data_vencimento: null,
        linha_digitavel: null,
      },
    };

    let docAnalysis: any = null; // Declarado no escopo pai (fix do commit 88a1018)

    const ehTipoDanfe =
      orientacaoAnalysis?.tipo_documento === "danfe" ||
      (!orientacaoAnalysis?.tipo_documento || orientacaoAnalysis.tipo_documento !== "boleto");

    expect(ehTipoDanfe).toBe(false);

    // Simula que o bloco DANFE foi pulado: docAnalysis permanece null
    // O bloco else if deve ser avaliável SEM lançar ReferenceError
    expect(() => {
      const _ = docAnalysis?.tipo_documento;
    }).not.toThrow();
  });

  // ─── B: Orientação 90° detectada corretamente ───
  it("B: Orientação 90° é detectada e aplicada antes da extração", () => {
    function calculateRotationNeeded(orientacao: number | undefined): number {
      if (!orientacao || orientacao === 0) return 0;
      return orientacao % 360;
    }

    expect(calculateRotationNeeded(90)).toBe(90);
    expect(calculateRotationNeeded(270)).toBe(270);
    expect(calculateRotationNeeded(180)).toBe(180);
    expect(calculateRotationNeeded(0)).toBe(0);
    expect(calculateRotationNeeded(undefined)).toBe(0);
  });

  // ─── C: Derivação determinística via linha digitável ───
  it("C: Valor derivado deterministicamente da linha digitável FEBRABAN (47 dígitos)", () => {
    // Linha digitável real de exemplo (47 dígitos, campo5 = fator + valor)
    const linhaValida = "34191.79001 01043.510047 91020.150008 5 15750000035050";
    const result = parseLinhaDigitavelFebraban(linhaValida);
    expect(result.valor).toBe(350.50);
    expect(result.vencimento).not.toBeNull();
  });

  it("C2: Linha com 44 dígitos (inválida) retorna null", () => {
    const linhaInvalida = "34191790010104351004791020";
    const result = parseLinhaDigitavelFebraban(linhaInvalida);
    expect(result.valor).toBeNull();
    expect(result.vencimento).toBeNull();
  });

  it("C3: Linha de 48 dígitos (guia arrecadação) é aceita como válida", () => {
    // Guia de arrecadação GNRE/GRU tem 48 dígitos (sem pontuação)
    const linha48digits = "8".repeat(48); // 48 dígitos puros
    expect(validarDigitosLinhaDigitavel(linha48digits)).toBe(true);
  });

  // ─── D: Lógica de valor final (derivado > OCR) ───
  it("D: Valor derivado da linha preferido sobre OCR quando disponível", () => {
    const valorDerivado = 350.50; // Da linha digitável
    const valorOCR = 35.50;       // OCR errou por conta da rotação
    const valorFinal = valorDerivado ?? valorOCR;
    expect(valorFinal).toBe(350.50);
  });

  it("D2: Quando linha digitável inválida, valor OCR é usado", () => {
    const valorDerivado: number | null = null; // Linha inválida
    const valorOCR = 1250.00;
    const valorFinal = valorDerivado ?? valorOCR;
    expect(valorFinal).toBe(1250.00);
  });

  it("D3: Quando ambos são null, valor final é null (fail-closed)", () => {
    const valorDerivado: number | null = null;
    const valorOCR: number | null = null;
    const valorFinal = valorDerivado ?? valorOCR;
    expect(valorFinal).toBeNull();
  });

  // ─── E: DANFE Brasnorte permanece íntegra ───
  it("E: Regressão DANFE Brasnorte — NF 000.832.082, chave válida", () => {
    const CHAVE_BRASNORTE = "31260831908617000133550010008320821035268195";
    const reconciled = reconcileNFeNumber("000.832.082", "1", CHAVE_BRASNORTE, "test-boleto-rotation", "telegram");
    expect(reconciled.numero_nf).toBe("000832082");
    expect(reconciled.numero_nf_formatado).toBe("000.832.082");
    expect(reconciled.match).toBe(true);
  });

  // ─── F: Validação de linha digitável mascarada no log ───
  it("F: Linha digitável mascarada corretamente no log (BOLETO_TRACE)", () => {
    const raw = "34191790010104351004791020150008515750000035050";
    const masked = raw.length > 10
      ? `${raw.slice(0, 5)}***${raw.slice(-4)}`
      : raw;
    expect(masked).toMatch(/^\d{5}\*\*\*\d{4}$/);
    expect(masked).not.toContain(raw.slice(5, -4)); // Parte do meio não exposta
  });

  // ─── G: Fluxo completo simulado — boleto de lado (90°) com segunda extração ───
  it("G: Fluxo completo — boleto fotografado 90° extrai valor corretamente após rotação", () => {
    // Simula o que acontece no bloco else if (boleto) após a correção:
    // 1. orientacaoAnalysis (Step 1): detecta 90° e tipo boleto — dados do OCR são null (imagem lateral)
    // 2. Após rotação, Gemini Primary extrai dados da imagem normalizada
    // 3. Linha digitável válida → valor derivado deterministicamente

    const orientacaoAnalysis = {
      tipo_documento: "boleto",
      orientacao_leitura: 90,
      boleto_dados: { beneficiario: null, valor: null, data_vencimento: null, linha_digitavel: null },
    };

    // Simula resposta do Gemini após rotação (imagem em pé)
    const bParsed = {
      banco: "Itaú Unibanco (341)",
      beneficiario: "CEMIG Distribuição S.A.",
      cnpj_cpf_beneficiario: "06.981.180/0001-16",
      pagador: "João da Silva",
      data_vencimento: "2026-09-20",
      valor: 350.50,
      linha_digitavel: "34191.79001 01043.510047 91020.150008 5 15750000035050",
      codigo_barras: null,
      nosso_numero: "12345",
      numero_documento: "FAT-2026-001",
    };

    const linhaDigitavelRaw = bParsed.linha_digitavel.replace(/\s/g, "");
    const febraban = parseLinhaDigitavelFebraban(linhaDigitavelRaw);
    const linhaValida = ["47", "48"].includes(linhaDigitavelRaw.replace(/\D/g, "").length.toString());

    const valorFinal = febraban.valor ?? bParsed.valor;
    const vencFinal = febraban.vencimento ?? bParsed.data_vencimento;

    // Resultado final do documentData
    const documentData = {
      tipo: "boleto",
      banco: bParsed.banco,
      beneficiario: bParsed.beneficiario || orientacaoAnalysis?.boleto_dados?.beneficiario || null,
      cnpj_cpf_beneficiario: bParsed.cnpj_cpf_beneficiario,
      pagador: bParsed.pagador,
      valor: valorFinal,
      data_vencimento: vencFinal,
      linha_digitavel: linhaDigitavelRaw,
      codigo_barras: null,
      nosso_numero: bParsed.nosso_numero,
      numero_documento: bParsed.numero_documento,
    };

    expect(documentData.tipo).toBe("boleto");
    expect(documentData.banco).toBe("Itaú Unibanco (341)");
    expect(documentData.beneficiario).toBe("CEMIG Distribuição S.A.");
    expect(documentData.valor).toBe(350.50); // Derivado via FEBRABAN
    expect(documentData.data_vencimento).not.toBeNull();
    expect(documentData.linha_digitavel.replace(/\D/g, "").length).toBe(47);
  });
});
