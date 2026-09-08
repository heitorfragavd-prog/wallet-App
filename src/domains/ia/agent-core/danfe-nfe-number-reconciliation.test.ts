/**
 * Testes de Regressão — Conciliação Determinística do Número da NF-e
 *
 * GABARITO REAL (DANFE Brasnorte):
 * Chave de acesso: 31260831908617000133550010008320821035268195
 *   cUF=31, AAMM=2608, CNPJ=31908617000133, modelo=55, serie=001,
 *   nNF=000832082, tpEmis=1, cNF=03526819, cDV=5
 *
 * NF CORRETA: 000.832.082  (não 000.083.208 — erro de leitura anterior)
 *
 * Guardas mantidas:
 * - CNPJ (14 dígitos) nunca pode virar numero_nf
 * - Chave deve ter exatamente 44 dígitos
 * - modelo deve ser 55 ou 65
 * - DV deve ser válido (módulo-11 SEFAZ)
 * - Chave válida prevalece sobre OCR quando divergem
 * - JSON inteiro nunca é serializado para busca de chave
 */

import { describe, it, expect } from "vitest";
import {
  extractNFeNumberFromAccessKey,
  findAccessKeyInPayload,
  formatNFeNumber,
  reconcileNFeNumber,
} from "../../../../supabase/functions/_shared/danfe-gemini-v2";

// ─── Chave REAL da DANFE Brasnorte ────────────────────────────────────────────
const CHAVE_REAL = "31260831908617000133550010008320821035268195";
const NF_REAL    = "000832082";        // nNF = digits[25..34] da chave real
const NF_FORMATADA = "000.832.082";    // formato padrão com pontos
const CNPJ_REAL  = "31908617000133";   // digits[6..20] da chave real

// ─── Chave de referência auxiliar com DV diferente para teste de rejeição ───
// Corrompemos o último dígito para garantir rejeição de DV inválido
const CHAVE_DV_INVALIDO = CHAVE_REAL.slice(0, 43) + String((parseInt(CHAVE_REAL[43]) + 1) % 10);

describe("DANFE — Testes Canônicos A-H (Número da NF) — Gabarito Brasnorte Corrigido", () => {

  // ── A: CNPJ nunca pode virar numero_nf ────────────────────────────────────
  it("A: CNPJ (14 dígitos) NUNCA pode se tornar numero_nf", () => {
    // formatNFeNumber rejeita entradas com > 9 dígitos
    expect(formatNFeNumber(CNPJ_REAL)).toBeNull();
    expect(formatNFeNumber("31.908.617/0001-33")).toBeNull();

    // reconcileNFeNumber sem chave: CNPJ -> source=none, nf=null
    const res = reconcileNFeNumber(CNPJ_REAL, "1", null, "test-A", "wallet");
    expect(res.source_selected).toBe("none");
    expect(res.numero_nf).toBeNull();
    expect(res.numero_nf_formatado).toBeNull();
  });

  // ── B: OCR correto + chave válida -> match=true, source=visual ────────────
  it("B: OCR correto (000.832.082) + chave real -> match=true, NF=000.832.082", () => {
    const res = reconcileNFeNumber("000.832.082", "1", CHAVE_REAL, "test-B", "wallet");
    expect(res.numero_nf).toBe(NF_REAL);
    expect(res.numero_nf_formatado).toBe(NF_FORMATADA);
    expect(res.source_selected).toBe("visual"); // match -> usa visual (mesmos dígitos)
    expect(res.match).toBe(true);
  });

  // ── B2: OCR divergente + chave real -> chave vence ────────────────────────
  it("B2: OCR divergente (000.000.001) + chave real -> chave vence: 000.832.082", () => {
    const res = reconcileNFeNumber("000.000.001", "1", CHAVE_REAL, "test-B2", "wallet");
    expect(res.numero_nf).toBe(NF_REAL);
    expect(res.numero_nf_formatado).toBe(NF_FORMATADA);
    expect(res.source_selected).toBe("access_key");
    expect(res.match).toBe(false);
  });

  // ── C: sem chave -> não inventar, usar visual se válido ───────────────────
  it("C: sem chave de acesso, numero_nf visual válido -> usa visual sem inventar", () => {
    const res = reconcileNFeNumber("832082", "1", null, "test-C", "wallet");
    expect(res.numero_nf).toBe("000832082");
    expect(res.numero_nf_formatado).toBe("000.832.082");
    expect(res.source_selected).toBe("visual");
    expect(res.match).toBe(false);
  });

  // ── D: sequência de 14 dígitos (CNPJ) rejeitada como access key ───────────
  it("D: CNPJ (14 dígitos) rejeitado como chave de acesso", () => {
    expect(findAccessKeyInPayload({ chave_acesso: CNPJ_REAL })).toBeNull();
    expect(findAccessKeyInPayload({ cabecalho: { chave_acesso: CNPJ_REAL } })).toBeNull();
  });

  // ── E: payload com CNPJ + NF + valores não forma falsa chave ─────────────
  it("E: payload JSON com CNPJ, NF e valores não concatena campos para falsa chave", () => {
    const payload = {
      cabecalho: {
        cnpj_fornecedor: "31.908.617/0001-33",
        numero_nf: "000.832.082",
        serie_nf: "1",
        data_emissao: "2026-08-20",
        valor_total: "1105.25",
        // chave_acesso: ausente propositalmente
      },
    };
    expect(findAccessKeyInPayload(payload)).toBeNull();
  });

  // ── F: chave 44 dígitos com modelo != 55 rejeitada ───────────────────────
  it("F: chave 44 dígitos com modelo != 55 é rejeitada", () => {
    // Trocar modelo para "01" (CT-e) na mesma posição e recalcular DV
    function calcDV(digits43: string): number {
      let sum = 0, w = 2;
      for (let i = digits43.length - 1; i >= 0; i--) {
        sum += parseInt(digits43[i]) * w;
        w = w === 9 ? 2 : w + 1;
      }
      const rem = sum % 11;
      return rem < 2 ? 0 : 11 - rem;
    }
    // Trocar posições 20-22 de "55" para "01"
    const k43mod01 = CHAVE_REAL.slice(0, 20) + "01" + CHAVE_REAL.slice(22, 43);
    const chaveModelo01 = k43mod01 + String(calcDV(k43mod01));
    expect(chaveModelo01.length).toBe(44);
    expect(chaveModelo01.slice(20, 22)).toBe("01");

    expect(findAccessKeyInPayload({ chave_acesso: chaveModelo01 })).toBeNull();
  });

  // ── G: chave 44 dígitos com DV inválido rejeitada ────────────────────────
  it("G: chave 44 dígitos com DV errado é rejeitada", () => {
    expect(CHAVE_DV_INVALIDO.length).toBe(44);
    expect(CHAVE_DV_INVALIDO).not.toBe(CHAVE_REAL); // DV diferente
    expect(findAccessKeyInPayload({ chave_acesso: CHAVE_DV_INVALIDO })).toBeNull();
  });

  // ── H: formatter end-to-end produz "📋 NF: 000.832.082 (Série 1)" ─────────
  it("H: numero_nf interno 000832082 -> formatter produz 000.832.082", () => {
    expect(formatNFeNumber("000832082")).toBe("000.832.082");
    expect(formatNFeNumber("832082")).toBe("000.832.082");
    expect(formatNFeNumber(832082)).toBe("000.832.082");
    expect(formatNFeNumber(NF_REAL)).toBe(NF_FORMATADA);

    const mensagem = `📋 NF: ${formatNFeNumber(NF_REAL)} (Série 1)`;
    expect(mensagem).toBe("📋 NF: 000.832.082 (Série 1)");
  });

  // ── Extras: findAccessKeyInPayload com chave real ────────────────────────
  it("findAccessKeyInPayload: aceita chave real no campo direto", () => {
    expect(findAccessKeyInPayload({ chave_acesso: CHAVE_REAL })).toBe(CHAVE_REAL);
  });

  it("findAccessKeyInPayload: aceita chave real em campo aninhado cabecalho.chave_acesso", () => {
    expect(findAccessKeyInPayload({ cabecalho: { chave_acesso: CHAVE_REAL } })).toBe(CHAVE_REAL);
  });

  it("findAccessKeyInPayload: aceita chave real com espaços em campo direto", () => {
    // Chave com espaços entre grupos de 4 (como aparece impressa na DANFE)
    const comEspacos = CHAVE_REAL.match(/.{4}/g)!.join(" ");
    expect(findAccessKeyInPayload({ chave_acesso: comEspacos })).toBe(CHAVE_REAL);
  });

  it("findAccessKeyInPayload: aceita chave real com pontos e traços em campo direto", () => {
    // Outro formato possível: "3126.0831.9086.1700.0133.5500.1000.8320.8210.3526.8195"
    const comPontos = CHAVE_REAL.match(/.{4}/g)!.join(".");
    expect(findAccessKeyInPayload({ chave_acesso: comPontos })).toBe(CHAVE_REAL);
  });

  it("extractNFeNumberFromAccessKey: extrai nNF correto da chave real", () => {
    const info = extractNFeNumberFromAccessKey(CHAVE_REAL);
    expect(info).not.toBeNull();
    expect(info!.nNF).toBe(NF_REAL);          // "000832082"
    expect(info!.nNFFormatado).toBe(NF_FORMATADA); // "000.832.082"
    expect(info!.modelo).toBe("55");
    expect(info!.CNPJ).toBe(CNPJ_REAL);
    expect(info!.serie).toBe("001");
    expect(info!.cDV).toBe("5");
  });

  it("reconcileNFeNumber: CNPJ como visualNumber + chave real -> chave vence sem expor CNPJ", () => {
    const res = reconcileNFeNumber(CNPJ_REAL, "1", CHAVE_REAL, "test", "wallet");
    // visualNormalized=null (14 dígitos), keyInfo=válido -> usa chave
    expect(res.numero_nf).toBe(NF_REAL);
    expect(res.numero_nf_formatado).toBe(NF_FORMATADA);
    expect(res.source_selected).toBe("access_key");
  });

  it("reconcileNFeNumber: CNPJ sem chave -> source=none, nf=null (fail-safe)", () => {
    const res = reconcileNFeNumber(CNPJ_REAL, "1", null, "test", "wallet");
    expect(res.source_selected).toBe("none");
    expect(res.numero_nf).toBeNull();
    expect(res.numero_nf_formatado).toBeNull();
  });

  it("formatNFeNumber: null, undefined, string vazia -> null", () => {
    expect(formatNFeNumber(null)).toBeNull();
    expect(formatNFeNumber(undefined)).toBeNull();
    expect(formatNFeNumber("")).toBeNull();
  });

  it("formatNFeNumber: 10 dígitos ou mais -> null (bloqueia CNPJ e outros números longos)", () => {
    expect(formatNFeNumber("1234567890")).toBeNull();    // 10 dígitos
    expect(formatNFeNumber("31908617000133")).toBeNull(); // 14 dígitos (CNPJ)
    expect(formatNFeNumber("44444444444444444444")).toBeNull(); // 20 dígitos
  });
});
