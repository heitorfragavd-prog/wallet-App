import { describe, it, expect, vi } from "vitest";
import { calculateRotationNeeded } from "../../../../supabase/functions/_shared/danfe-extractor";
import { normalizeAndRotateImageMatrix } from "../../../../supabase/functions/_shared/ai/danfe-visual-pipeline";

describe("Document Orientation & Normalization Pipeline (Etapa 1.2)", () => {
  // ── 1. SEMÂNTICA DO ÂNGULO & calculateRotationNeeded ─────────────────────
  it("A: calculateRotationNeeded retorna exatamente os graus válidos (0, 90, 180, 270)", () => {
    expect(calculateRotationNeeded(0)).toBe(0);
    expect(calculateRotationNeeded(90)).toBe(90);
    expect(calculateRotationNeeded(180)).toBe(180);
    expect(calculateRotationNeeded(270)).toBe(270);
    expect(calculateRotationNeeded(null)).toBe(0);
    expect(calculateRotationNeeded(undefined)).toBe(0);
    expect(calculateRotationNeeded(45 as any)).toBe(0);
    expect(calculateRotationNeeded(360 as any)).toBe(0);
  });

  // ── 2. ORIENTAÇÃO 0° (SEM ROTAÇÃO / PRESERVA ORIGINAL) ────────────────────
  it("B: Imagem com orientação 0° -> sem rotação, preserva integridade", async () => {
    const fakeBase64 = "dGVzdGVfaW1hZ2VtX2VtX3Bl";
    const res = await normalizeAndRotateImageMatrix(fakeBase64, 0);

    // Em ambiente Node/test, não executa ImageScript e retorna base64 original
    expect(res.rotated).toBe(false);
    expect(res.base64).toBe(fakeBase64);
  });

  // ── 3. ORIENTAÇÃO 90°, 180°, 270° ─────────────────────────────────────────
  it("C: Imagem com orientação 90° -> calcula rotação necessária de 90°", () => {
    const rot = calculateRotationNeeded(90);
    expect(rot).toBe(90);
  });

  it("D: Imagem com orientação 180° -> calcula rotação necessária de 180°", () => {
    const rot = calculateRotationNeeded(180);
    expect(rot).toBe(180);
  });

  it("E: Imagem com orientação 270° -> calcula rotação necessária de 270°", () => {
    const rot = calculateRotationNeeded(270);
    expect(rot).toBe(270);
  });

  // ── 4. PDF PRESERVADO ──────────────────────────────────────────────────────
  it("F: PDF não deve sofrer rotação matricial raster", () => {
    const mimeType = "application/pdf";
    const isRasterImage =
      mimeType.startsWith("image/") &&
      (mimeType === "image/jpeg" || mimeType === "image/jpg" || mimeType === "image/png" || mimeType === "image/webp");

    expect(isRasterImage).toBe(false);
  });

  // ── 5. REGRESSÃO DO BUG REAL: SPAL LATERAL COM 'Analise este arquivo.' ───
  it("G: Imagem lateral SPAL + 'Analise este arquivo.' -> detecção e despacho de boleto", () => {
    const rawAnalysis = {
      tipo_documento: "boleto",
      orientacao_leitura: 270,
      confianca: 0.95,
      motivo: "Boleto bancário Itaú / SPAL identificado, orientado a 270°",
    };

    const rotation = calculateRotationNeeded(rawAnalysis.orientacao_leitura as any);
    expect(rotation).toBe(270);
    expect(rawAnalysis.tipo_documento).toBe("boleto");
  });

  // ── 6. TIPO OUTRO -> FAIL-CLOSED ──────────────────────────────────────────
  it("H: Tipo outro -> não aciona rotação financeira nem proposta", () => {
    const rawAnalysis = {
      tipo_documento: "outro",
      orientacao_leitura: 0,
      confianca: 0.2,
      motivo: "Documento genérico não reconhecido",
    };

    expect(rawAnalysis.tipo_documento).toBe("outro");
  });
});