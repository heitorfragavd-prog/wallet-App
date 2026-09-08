/**
 * ssrf-protection.test.ts
 * 
 * Testes unitários para comprovar o bloqueio de SSRF (Server-Side Request Forgery)
 * em endpoints que realizam requisições HTTP externas (como test-webhook e ia-deposito):
 * - Bloqueio de loopback (127.0.0.1, localhost, ::1)
 * - Bloqueio de IPv6 link-local, unique local e IPv4-mapped IPv6
 * - Bloqueio de IP de metadados de nuvem (169.254.169.254, fd00:ec2::254, metadata.google.internal)
 * - Bloqueio de redes privadas (RFC 1918: 10.x, 192.168.x, 172.16.x)
 * - Bloqueio de CGNAT (100.64.x) e broadcast (0.0.0.0)
 * - Verificação de política de redirecionamento (redirect: 'error') no código do handler
 * - Aceitação de URLs externas públicas legítimas (HTTPS/HTTP)
 */
import { describe, it, expect } from "vitest";
import {
  isAllowedWebhookUrl,
  isPrivateOrRestrictedIp,
  validateSafeExternalUrl,
} from "../../../supabase/functions/_shared/ssrf-validator.ts";
import * as fs from "fs";
import * as path from "path";

describe("Proteção Anti-SSRF em Requisições Externas", () => {
  it("Valida diretamente a função isPrivateOrRestrictedIp", () => {
    expect(isPrivateOrRestrictedIp("127.0.0.1")).toBe(true);
    expect(isPrivateOrRestrictedIp("10.0.0.1")).toBe(true);
    expect(isPrivateOrRestrictedIp("192.168.1.1")).toBe(true);
    expect(isPrivateOrRestrictedIp("169.254.169.254")).toBe(true);
    expect(isPrivateOrRestrictedIp("::1")).toBe(true);
    expect(isPrivateOrRestrictedIp("8.8.8.8")).toBe(false);
    expect(isPrivateOrRestrictedIp("1.1.1.1")).toBe(false);
  });

  it("Valida a função assíncrona validateSafeExternalUrl", async () => {
    const resBlocked = await validateSafeExternalUrl("http://127.0.0.1:8000/webhook");
    expect(resBlocked.valid).toBe(false);

    const resAllowed = await validateSafeExternalUrl("https://api.github.com/events");
    expect(resAllowed.valid).toBe(true);
  });

  it("Bloqueia loopback IPv4 e hostnames locais", () => {
    expect(isAllowedWebhookUrl("http://127.0.0.1:8000/callback")).toBe(false);
    expect(isAllowedWebhookUrl("http://127.0.0.2:3000/hook")).toBe(false);
    expect(isAllowedWebhookUrl("http://localhost:3000/webhook")).toBe(false);
    expect(isAllowedWebhookUrl("http://sub.localhost/test")).toBe(false);
    expect(isAllowedWebhookUrl("http://0.0.0.0:80/admin")).toBe(false);
  });

  it("Bloqueia loopback e faixas privadas IPv6", () => {
    expect(isAllowedWebhookUrl("http://[::1]:8080/")).toBe(false);
    expect(isAllowedWebhookUrl("http://[::]:8080/")).toBe(false);
    expect(isAllowedWebhookUrl("http://[fe80::1]/")).toBe(false);
    expect(isAllowedWebhookUrl("http://[fc00::1]/secret")).toBe(false);
    expect(isAllowedWebhookUrl("http://[fd12:3456:789a::1]/")).toBe(false);
  });

  it("Bloqueia IPv4-mapped IPv6 para loopback e IPs privados", () => {
    expect(isAllowedWebhookUrl("http://[::ffff:127.0.0.1]/")).toBe(false);
    expect(isAllowedWebhookUrl("http://[::ffff:169.254.169.254]/latest")).toBe(false);
    expect(isAllowedWebhookUrl("http://[::ffff:10.0.0.1]/admin")).toBe(false);
    expect(isAllowedWebhookUrl("http://[::ffff:192.168.1.1]/")).toBe(false);
  });

  it("Bloqueia endpoints de metadata de nuvem (AWS/GCP/Azure)", () => {
    expect(isAllowedWebhookUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isAllowedWebhookUrl("http://[fd00:ec2::254]/latest/meta-data/")).toBe(false);
    expect(isAllowedWebhookUrl("http://metadata.google.internal/computeMetadata/v1/")).toBe(false);
    expect(isAllowedWebhookUrl("http://instance-data/latest/meta-data/")).toBe(false);
  });

  it("Bloqueia faixas de rede privada RFC 1918 e CGNAT", () => {
    expect(isAllowedWebhookUrl("http://10.0.0.1/intranet")).toBe(false);
    expect(isAllowedWebhookUrl("http://192.168.1.1/router")).toBe(false);
    expect(isAllowedWebhookUrl("http://172.16.0.5/internal-api")).toBe(false);
    expect(isAllowedWebhookUrl("http://172.31.255.255/db")).toBe(false);
    expect(isAllowedWebhookUrl("http://100.64.0.1/cgnat")).toBe(false);
    expect(isAllowedWebhookUrl("http://100.127.255.255/cgnat")).toBe(false);
  });

  it("Bloqueia domínios internos e protocolos perigosos", () => {
    expect(isAllowedWebhookUrl("http://database.internal/query")).toBe(false);
    expect(isAllowedWebhookUrl("http://printer.local/status")).toBe(false);
    expect(isAllowedWebhookUrl("file:///etc/passwd")).toBe(false);
    expect(isAllowedWebhookUrl("gopher://127.0.0.1:6379/")).toBe(false);
    expect(isAllowedWebhookUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isAllowedWebhookUrl("javascript:alert(1)")).toBe(false);
  });

  it("Permite URLs públicas válidas (HTTPS/HTTP)", () => {
    expect(isAllowedWebhookUrl("https://api.telegram.org/bot123/sendMessage")).toBe(true);
    expect(isAllowedWebhookUrl("https://webhook.site/uuid-1234")).toBe(true);
    expect(isAllowedWebhookUrl("https://hooks.slack.com/services/T00/B00/X00")).toBe(true);
    expect(isAllowedWebhookUrl("https://api.github.com/repos/test")).toBe(true);
  });

  it("Verifica se o handler de test-webhook implementa redirect: 'error'", () => {
    const handlerPath = path.resolve(process.cwd(), "supabase/functions/test-webhook/index.ts");
    const code = fs.readFileSync(handlerPath, "utf-8");

    expect(code).toContain('redirect: "error"');
  });

  it("Verifica se o handler de test-webhook exige role: 'admin'", () => {
    const handlerPath = path.resolve(process.cwd(), "supabase/functions/test-webhook/index.ts");
    const code = fs.readFileSync(handlerPath, "utf-8");

    expect(code).toContain('profile.role !== "admin"');
    expect(code).toContain("status: 403");
  });
});

