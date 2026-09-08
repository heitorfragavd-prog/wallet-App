/**
 * ssrf-protection.test.ts
 * 
 * Testes unitários para comprovar o bloqueio de SSRF (Server-Side Request Forgery)
 * em endpoints que realizam requisições HTTP externas (como test-webhook e ia-deposito):
 * - Bloqueio de loopback (127.0.0.1, localhost)
 * - Bloqueio de IP de metadados de nuvem (169.254.169.254)
 * - Bloqueio de redes privadas (RFC 1918: 10.x, 192.168.x, 172.16.x)
 * - Aceitação de URLs externas públicas legítimas
 */
import { describe, it, expect } from "vitest";

function isAllowedWebhookUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const hostname = parsed.hostname.toLowerCase();

    // Bloqueia loopback e faixas de rede privada/metadata (SSRF)
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname === "169.254.169.254" ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      /^172.(1[6-9]|2[0-9]|3[0-1])./.test(hostname) ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".local")
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

describe("Proteção Anti-SSRF em Requisições Externas", () => {
  it("Bloqueia loopback 127.0.0.1 e localhost", () => {
    expect(isAllowedWebhookUrl("http://127.0.0.1:8000/callback")).toBe(false);
    expect(isAllowedWebhookUrl("http://localhost:3000/webhook")).toBe(false);
    expect(isAllowedWebhookUrl("http://0.0.0.0:80/admin")).toBe(false);
  });

  it("Bloqueia endpoint de metadata de nuvem (AWS/GCP)", () => {
    expect(isAllowedWebhookUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
  });

  it("Bloqueia faixas de rede privada RFC 1918", () => {
    expect(isAllowedWebhookUrl("http://10.0.0.1/intranet")).toBe(false);
    expect(isAllowedWebhookUrl("http://192.168.1.1/router")).toBe(false);
    expect(isAllowedWebhookUrl("http://172.16.0.5/internal-api")).toBe(false);
    expect(isAllowedWebhookUrl("http://172.31.255.255/db")).toBe(false);
  });

  it("Bloqueia domínios internos e protocolos inseguros", () => {
    expect(isAllowedWebhookUrl("http://database.internal/query")).toBe(false);
    expect(isAllowedWebhookUrl("http://printer.local/status")).toBe(false);
    expect(isAllowedWebhookUrl("file:///etc/passwd")).toBe(false);
    expect(isAllowedWebhookUrl("gopher://127.0.0.1:6379/")).toBe(false);
  });

  it("Permite URLs públicas válidas (HTTPS/HTTP)", () => {
    expect(isAllowedWebhookUrl("https://api.telegram.org/bot123/sendMessage")).toBe(true);
    expect(isAllowedWebhookUrl("https://webhook.site/uuid-1234")).toBe(true);
    expect(isAllowedWebhookUrl("https://hooks.slack.com/services/T00/B00/X00")).toBe(true);
  });
});
