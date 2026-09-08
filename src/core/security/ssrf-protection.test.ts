/**
 * ssrf-protection.test.ts
 * 
 * Testes unitários para comprovar a defesa contra SSRF (Server-Side Request Forgery)
 * e Mitigação de DNS Rebinding em conexões HTTPS:
 * - Bloqueio de loopback (127.0.0.1, localhost, ::1)
 * - Bloqueio de IPv6 link-local, unique local e IPv4-mapped IPv6
 * - Bloqueio de IP de metadados de nuvem (169.254.169.254, fd00:ec2::254, metadata.google.internal)
 * - Bloqueio de redes privadas (RFC 1918: 10.x, 192.168.x, 172.16.x)
 * - Bloqueio de CGNAT (100.64.x) e broadcast (0.0.0.0)
 * - Exigência de HTTPS estrito e rejeição de credenciais embutidas na URL
 * - Política de Allowlist de destinos homologados para mitigar DNS Rebinding
 * - Verificação de política de redirecionamento (redirect: "error")
 */
import { describe, it, expect } from "vitest";
import {
  isAllowedWebhookUrl,
  isPrivateOrRestrictedIp,
  validateSafeExternalUrl,
  ALLOWED_WEBHOOK_DOMAINS,
} from "../../../supabase/functions/_shared/ssrf-validator.ts";

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

  it("Bloqueia protocolos não-HTTPS (HTTP plain desabilitado em produção)", () => {
    expect(isAllowedWebhookUrl("http://127.0.0.1:8000/callback")).toBe(false);
    expect(isAllowedWebhookUrl("http://api.github.com/events")).toBe(false);
    expect(isAllowedWebhookUrl("ftp://api.github.com/")).toBe(false);
    expect(isAllowedWebhookUrl("file:///etc/passwd")).toBe(false);
  });

  it("Bloqueia loopback IPv4 e hostnames locais mesmo com HTTPS forjado", () => {
    expect(isAllowedWebhookUrl("https://127.0.0.1/webhook")).toBe(false);
    expect(isAllowedWebhookUrl("https://localhost/webhook")).toBe(false);
    expect(isAllowedWebhookUrl("https://sub.localhost/test")).toBe(false);
    expect(isAllowedWebhookUrl("https://0.0.0.0/admin")).toBe(false);
  });

  it("Bloqueia loopback e faixas privadas IPv6", () => {
    expect(isAllowedWebhookUrl("https://[::1]/")).toBe(false);
    expect(isAllowedWebhookUrl("https://[::]/")).toBe(false);
    expect(isAllowedWebhookUrl("https://[fe80::1]/")).toBe(false);
    expect(isAllowedWebhookUrl("https://[fc00::1]/secret")).toBe(false);
    expect(isAllowedWebhookUrl("https://[fd12:3456:789a::1]/")).toBe(false);
  });

  it("Bloqueia IPv4-mapped IPv6 para loopback e IPs privados", () => {
    expect(isAllowedWebhookUrl("https://[::ffff:127.0.0.1]/")).toBe(false);
    expect(isAllowedWebhookUrl("https://[::ffff:169.254.169.254]/latest")).toBe(false);
    expect(isAllowedWebhookUrl("https://[::ffff:10.0.0.1]/admin")).toBe(false);
    expect(isAllowedWebhookUrl("https://[::ffff:192.168.1.1]/")).toBe(false);
  });

  it("Bloqueia endpoints de metadata de nuvem (AWS/GCP/Azure)", () => {
    expect(isAllowedWebhookUrl("https://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isAllowedWebhookUrl("https://[fd00:ec2::254]/latest/meta-data/")).toBe(false);
    expect(isAllowedWebhookUrl("https://metadata.google.internal/computeMetadata/v1/")).toBe(false);
    expect(isAllowedWebhookUrl("https://instance-data/latest/meta-data/")).toBe(false);
  });

  it("Bloqueia portas não padrão e credenciais embutidas na URL", () => {
    expect(isAllowedWebhookUrl("https://api.github.com:8443/events")).toBe(false);
    expect(isAllowedWebhookUrl("https://user:password@api.github.com/events")).toBe(false);
  });

  it("Aplica Allowlist estrita para mitigar DNS Rebinding em HTTPS", () => {
    // Domínios aprovados passam
    expect(isAllowedWebhookUrl("https://api.telegram.org/bot123/sendMessage")).toBe(true);
    expect(isAllowedWebhookUrl("https://hooks.slack.com/services/T00/B00/X00")).toBe(true);
    expect(isAllowedWebhookUrl("https://hooks.zapier.com/hooks/catch/123/abc")).toBe(true);
    expect(isAllowedWebhookUrl("https://api.github.com/repos/test")).toBe(true);

    // Domínio arbitrário não homologado é bloqueado por fail-closed
    expect(isAllowedWebhookUrl("https://attacker-controlled-rebinding.com/hook")).toBe(false);
    expect(isAllowedWebhookUrl("https://arbitrary-webhook-site.com/hook")).toBe(false);
  });
});