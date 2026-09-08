/**
 * Testes Automatizados — Image Optimizer: Prova de Preservação de Bytes
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { optimizeImageForVision } from "./imageOptimizer";

describe("Image Optimizer — Prova de Preservação de Bytes e Resolução", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1: Imagem <= 2560px e <= 5MB preserva o Blob/File original intacto sem recompressão", async () => {
    // Cria um arquivo JPEG simulado de 100KB
    const fakeContent = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    const file = new File([fakeContent], "foto_boleto.jpg", { type: "image/jpeg" });

    // Spy no FileReader
    const originalImage = globalThis.Image;
    globalThis.Image = class {
      width = 900;
      height = 1600;
      onload: (() => void) | null = null;
      set src(_val: string) {
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 10);
      }
    } as unknown as typeof Image;

    try {
      const res = await optimizeImageForVision(file, 2048, 0.90);

      // Prova de integridade de bytes
      expect(res.size).toBe(file.size);
      expect(res.blob).toBe(file); // É o próprio File original, sem novo Blob do Canvas!
      expect(res.mimeType).toBe("image/jpeg");
      expect(res.dataUrl).toContain("data:image/jpeg;base64,");
    } finally {
      globalThis.Image = originalImage;
    }
  });

  it("2: Documento PDF preserva o arquivo original intacto sem passar por Canvas", async () => {
    const fakePdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    const file = new File([fakePdf], "documento.pdf", { type: "application/pdf" });

    const res = await optimizeImageForVision(file);
    expect(res.size).toBe(file.size);
    expect(res.blob).toBe(file);
    expect(res.mimeType).toBe("application/pdf");
  });
});
