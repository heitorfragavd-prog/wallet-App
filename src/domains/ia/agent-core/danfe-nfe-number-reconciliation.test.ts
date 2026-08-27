/**
 * Testes de Regressão — Conciliação Determinística do Número da NF-e
 * Garante que CNPJ nunca vira NF, DV inválido é rejeitado, modelo != 55 é rejeitado,
 * e a chave válida sempre prevalece sobre o OCR visual.
 *
 * Cenários A-H conforme especificado pelo usuário.
 */

import { describe, it, expect } from "vitest";
import {
  extractNFeNumberFromAccessKey,
  findAccessKeyInPayload,
  formatNFeNumber,
  reconcileNFeNumber,
} from "../../../../supabase/functions/_shared/danfe-gemini-v2";

// ─── Chave de referência construída deterministicamente para testes ───────────
// cUF=51 + AAMM=2608 + CNPJ=31908617000133 + mod=55 + serie=001 + nNF=000083208
// tpEmis=1 + cNF=00000000 + cDV calculado via módulo-11 SEFAZ
// Cálculo do DV para os 43 dígitos: 5126083190861700013355001000083208100000000
// (DV sera calculado pela própria função; usamos uma chave real de homologação fictícia
//  com DV correto verificado manualmente abaixo)

// Função local de apoio para calcular DV — replica a lógica de validateNFeAccessKeyDV
function calcDV(digits43: string): number {
  let sum = 0;
  let weight = 2;
  for (let i = digits43.length - 1; i >= 0; i--) {
    sum += parseInt(digits43[i], 10) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rem = sum % 11;
  return rem < 2 ? 0 : 11 - rem;
}

const KEY43 = "5126083190861700013355001000083208100000000";
expect(KEY43.length).toBe(43); // sanidade
const DV = calcDV(KEY43);
const CHAVE_REFERENCIA_44 = KEY43 + String(DV);
expect(CHAVE_REFERENCIA_44.length).toBe(44);

// CNPJ extraído da chave de referência (posições 6..20)
const CNPJ_DA_CHAVE = CHAVE_REFERENCIA_44.substring(6, 20); // "31908617000133"
const NF_DA_CHAVE = CHAVE_REFERENCIA_44.substring(25, 34);  // "000083208"

describe("DANFE — Testes Canônicos A-H (Número da NF)", () => {
  // ── A: CNPJ nunca pode virar numero_nf ────────────────────────────────────
  it("A: CNPJ (14 dígitos) NUNCA pode se tornar numero_nf", () => {
    const cnpj = "31.908.617/0001-33";
    const cnpjClean = "31908617000133";

    // formatNFeNumber deve rejeitar 14 dígitos
    expect(formatNFeNumber(cnpjClean)).toBeNull();
    expect(formatNFeNumber(cnpj)).toBeNull();

    // reconcileNFeNumber com cnpj como visualNumber e sem chave -> source=none, nf=null
    const res = reconcileNFeNumber(cnpjClean, "1", null, "test", "wallet");
    expect(res.source_selected).toBe("none");
    expect(res.numero_nf).toBeNull();
    expect(res.numero_nf_formatado).toBeNull();
  });

  // ── B: chave válida prevalece sobre OCR errado ────────────────────────────
  it("B: numero_nf OCR errado (000.832.082) + chave válida -> chave vence: 000.083.208", () => {
    const res = reconcileNFeNumber("000.832.082", "1", CHAVE_REFERENCIA_44, "test-B", "wallet");
    expect(res.numero_nf).toBe(NF_DA_CHAVE);
    expect(res.numero_nf_formatado).toBe("000.083.208");
    expect(res.source_selected).toBe("access_key");
    expect(res.match).toBe(false);
  });

  // ── C: sem chave de acesso — não inventar ────────────────────────────────
  it("C: sem chave de acesso, numero_nf visual válido -> usa visual sem inventar", () => {
    const res = reconcileNFeNumber("83208", "1", null, "test-C", "wallet");
    expect(res.numero_nf).toBe("000083208");
    expect(res.numero_nf_formatado).toBe("000.083.208");
    expect(res.source_selected).toBe("visual");
    expect(res.match).toBe(false);
  });

  // ── D: sequência com 14 dígitos rejeitada como access key ────────────────
  it("D: sequência de 14 dígitos (CNPJ) rejeitada como chave de acesso", () => {
    // Se passarmos o CNPJ como chave, findAccessKeyInPayload deve rejeitar
    const result = findAccessKeyInPayload({ chave_acesso: CNPJ_DA_CHAVE });
    expect(result).toBeNull();
  });

  // ── E: JSON com CNPJ + NF + valores não forma falsa chave ────────────────
  it("E: payload JSON com CNPJ, NF e valores não concatena campos para formar falsa chave", () => {
    const payload = {
      cabecalho: {
        cnpj_fornecedor: "31.908.617/0001-33",
        numero_nf: "000.832.082",
        serie_nf: "1",
        data_emissao: "2026-08-20",
        valor_total: "1105.25",
        // chave_acesso: ausente
      },
    };
    // findAccessKeyInPayload NÃO deve serializar o JSON e encontrar combinação artificial
    const key = findAccessKeyInPayload(payload);
    expect(key).toBeNull();
  });

  // ── F: chave 44 dígitos com modelo != 55 rejeitada ───────────────────────
  it("F: chave 44 dígitos com modelo != 55 é rejeitada", () => {
    // modelo em posição [20..22]; mudar para "01" (CTe) e recalcular DV
    const key43_mod01 = "5126083190861700013301001000083208100000000";
    const dv = calcDV(key43_mod01);
    const chaveModelo01 = key43_mod01 + String(dv);
    expect(chaveModelo01.length).toBe(44);
    expect(chaveModelo01.substring(20, 22)).toBe("01"); // confirmar modelo != 55

    const result = findAccessKeyInPayload({ chave_acesso: chaveModelo01 });
    expect(result).toBeNull();

    const info = extractNFeNumberFromAccessKey(chaveModelo01);
    // extractNFeNumberFromAccessKey ainda extrai (não valida modelo), mas findAccessKeyInPayload rejeita
    expect(info).not.toBeNull(); // a extração estrutural funciona
    // O bloqueio acontece no findAccessKeyInPayload
  });

  // ── G: chave 44 dígitos com DV inválido rejeitada ────────────────────────
  it("G: chave 44 dígitos com DV errado é rejeitada por findAccessKeyInPayload", () => {
    // Pegar a chave de referência válida e corromper o último dígito
    const lastDigit = parseInt(CHAVE_REFERENCIA_44[43], 10);
    const wrongDigit = (lastDigit + 1) % 10;
    const chaveInvalidaDV = CHAVE_REFERENCIA_44.slice(0, 43) + String(wrongDigit);
    expect(chaveInvalidaDV.length).toBe(44);

    const result = findAccessKeyInPayload({ chave_acesso: chaveInvalidaDV });
    expect(result).toBeNull();
  });

  // ── H: formatter end-to-end produz exatamente "📋 NF: 000.083.208 (Série 1)" ──
  it("H: numero_nf interno 000083208 -> formatter produz 000.083.208", () => {
    expect(formatNFeNumber("000083208")).toBe("000.083.208");
    expect(formatNFeNumber("83208")).toBe("000.083.208");
    expect(formatNFeNumber(83208)).toBe("000.083.208");

    // Simulação do texto da mensagem final
    const nfFormatada = formatNFeNumber(NF_DA_CHAVE);
    const mensagem = `📋 NF: ${nfFormatada} (Série 1)`;
    expect(mensagem).toBe("📋 NF: 000.083.208 (Série 1)");
  });

  // ── Extras: garantias adicionais ──────────────────────────────────────────
  it("findAccessKeyInPayload: aceita chave válida em campo direto", () => {
    const result = findAccessKeyInPayload({ chave_acesso: CHAVE_REFERENCIA_44 });
    expect(result).toBe(CHAVE_REFERENCIA_44);
  });

  it("findAccessKeyInPayload: aceita chave válida em campo aninhado cabecalho.chave_acesso", () => {
    const result = findAccessKeyInPayload({ cabecalho: { chave_acesso: CHAVE_REFERENCIA_44 } });
    expect(result).toBe(CHAVE_REFERENCIA_44);
  });

  it("findAccessKeyInPayload: chave com espaços e pontuação é normalizada e aceita se DV válido", () => {
    // CHAVE_REFERENCIA_44 em 11 blocos de 4 dígitos separados por espaço
    const comEspacos = CHAVE_REFERENCIA_44.match(/.{4}/g)!.join(" "); // ex: "5126 0831 9086..."
    // Esta versão NÃO passa mais pelo block-regex (foi removido), mas se estiver no campo direto:
    const result = findAccessKeyInPayload({ chave_acesso: comEspacos });
    expect(result).toBe(CHAVE_REFERENCIA_44);
  });

  it("reconcileNFeNumber: CNPJ como numero_nf + chave válida -> chave vence sem expor CNPJ", () => {
    const res = reconcileNFeNumber(CNPJ_DA_CHAVE, "1", CHAVE_REFERENCIA_44, "test", "wallet");
    // visualNormalized é null (CNPJ tem 14 dígitos), keyInfo é válido -> usa chave
    expect(res.numero_nf).toBe(NF_DA_CHAVE);
    expect(res.numero_nf_formatado).toBe("000.083.208");
    expect(res.source_selected).toBe("access_key");
  });

  it("reconcileNFeNumber: CNPJ como numero_nf sem chave -> source=none, nf=null (fail-safe)", () => {
    const res = reconcileNFeNumber(CNPJ_DA_CHAVE, "1", null, "test", "wallet");
    expect(res.source_selected).toBe("none");
    expect(res.numero_nf).toBeNull();
    expect(res.numero_nf_formatado).toBeNull();
  });

  it("extractNFeNumberFromAccessKey: extrai nNF correto da chave de referência", () => {
    const info = extractNFeNumberFromAccessKey(CHAVE_REFERENCIA_44);
    expect(info).not.toBeNull();
    expect(info!.nNF).toBe(NF_DA_CHAVE);       // "000083208"
    expect(info!.nNFFormatado).toBe("000.083.208");
    expect(info!.modelo).toBe("55");
    expect(info!.CNPJ).toBe(CNPJ_DA_CHAVE);
  });

  it("formatNFeNumber: null, undefined, string vazia -> null", () => {
    expect(formatNFeNumber(null)).toBeNull();
    expect(formatNFeNumber(undefined)).toBeNull();
    expect(formatNFeNumber("")).toBeNull();
  });
});
