/**
 * ssrf-validator.ts
 *
 * Módulo centralizado de validação Anti-SSRF para Edge Functions da Wallet App.
 *
 * POLÍTICA DE SEGURANÇA:
 * 1. Protocolo: Apenas HTTPS estrito (porta 443). HTTP inseguro desabilitado.
 * 2. Bloqueio de Redes Privadas e Reservadas (IPv4 e IPv6):
 *    - Loopback: 127.0.0.0/8, ::1
 *    - Link-Local / Cloud Metadata: 169.254.0.0/16, fd00:ec2::254, fe80::/10
 *    - RFC 1918: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
 *    - CGNAT: 100.64.0.0/10
 *    - Hostnames de nuvem: metadata.google.internal, instance-data, etc.
 * 3. Bloqueio de Destinos Arbitrários (Mitigação de DNS Rebinding em HTTPS):
 *    Como a Web API padrão `fetch` no Deno runtime não suporta IP pinning com validação
 *    de SNI customizada simultaneamente, a política de produção adota FAIL-CLOSED para destinos
 *    não autorizados: apenas domínios explicitamente permitidos na ALLOWLIST são aceitos.
 */

// Allowlist de provedores e domínios de webhook homologados
export const ALLOWED_WEBHOOK_DOMAINS = [
  "hooks.zapier.com",
  "hook.integromat.com",
  "hook.eu1.make.com",
  "hook.us1.make.com",
  "discord.com",
  "discordapp.com",
  "api.slack.com",
  "hooks.slack.com",
  "api.telegram.org",
  "api.github.com",
];

export function isPrivateOrRestrictedIp(ip: string): boolean {
  const clean = ip.replace(/^\[|\]$/g, "").trim().toLowerCase();

  // IPv4-mapped IPv6 (ex: ::ffff:127.0.0.1 ou normalizado como ::ffff:7f00:1)
  if (clean.startsWith("::ffff:")) {
    const v4Part = clean.slice(7);
    if (v4Part.includes(".")) {
      return isPrivateOrRestrictedIp(v4Part);
    }
    const hexParts = v4Part.split(":");
    if (hexParts.length === 2) {
      const high = parseInt(hexParts[0], 16);
      const low = parseInt(hexParts[1], 16);
      if (!isNaN(high) && !isNaN(low)) {
        const a = (high >> 8) & 0xff;
        const b = high & 0xff;
        const c = (low >> 8) & 0xff;
        const d = low & 0xff;
        return isPrivateOrRestrictedIp(`${a}.${b}.${c}.${d}`);
      }
    }
    return true; // Fail-closed para mapeamentos anômalos
  }

  // Checagem IPv4
  const ipv4Match = clean.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, aStr, bStr, cStr, dStr] = ipv4Match;
    const a = Number(aStr);
    const b = Number(bStr);
    const c = Number(cStr);
    const d = Number(dStr);

    if (a < 0 || a > 255 || b < 0 || b > 255 || c < 0 || c > 255 || d < 0 || d > 255) {
      return true;
    }

    if (a === 0) return true;                                // 0.0.0.0/8
    if (a === 10) return true;                               // 10.0.0.0/8
    if (a === 100 && b >= 64 && b <= 127) return true;        // 100.64.0.0/10 (CGNAT)
    if (a === 127) return true;                              // 127.0.0.0/8 (Loopback)
    if (a === 169 && b === 254) return true;                  // 169.254.0.0/16 (Link-Local / Metadata)
    if (a === 172 && b >= 16 && b <= 31) return true;        // 172.16.0.0/12
    if (a === 192 && b === 0 && c === 0) return true;        // 192.0.0.0/24
    if (a === 192 && b === 168) return true;                 // 192.168.0.0/16
    if (a === 198 && (b === 18 || b === 19)) return true;     // 198.18.0.0/15
    if (a >= 224) return true;                               // Multicast / Reserved

    return false;
  }

  // Checagem IPv6
  if (
    clean === "::" ||
    clean === "::1" ||
    clean.startsWith("fe80:") ||
    clean.startsWith("fe9") ||
    clean.startsWith("fea") ||
    clean.startsWith("feb") ||
    clean.startsWith("fc") ||
    clean.startsWith("fd") ||
    clean === "fd00:ec2::254"
  ) {
    return true;
  }

  return false;
}

export function isAllowedWebhookUrl(rawUrl: string, enforceAllowlist = true): boolean {
  try {
    const parsed = new URL(rawUrl);

    // 1. Apenas HTTPS estrito (sem HTTP em produção)
    if (parsed.protocol !== "https:") {
      return false;
    }

    // 2. Não permitir portas não padrão
    if (parsed.port && parsed.port !== "443") {
      return false;
    }

    // 3. Bloquear credenciais embutidas na URL (ex: https://admin:pass@host)
    if (parsed.username || parsed.password) {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

    // 4. Hostnames reservados / internos / metadata
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".local") ||
      hostname === "169.254.169.254" ||
      hostname === "metadata.google.internal" ||
      hostname === "instance-data"
    ) {
      return false;
    }

    // 5. Bloquear IP direto
    if (isPrivateOrRestrictedIp(hostname)) {
      return false;
    }

    // 6. Mitigação contra DNS Rebinding: Restringir a domínios previamente aprovados
    if (enforceAllowlist) {
      const isDomainApproved = ALLOWED_WEBHOOK_DOMAINS.some(
        domain => hostname === domain || hostname.endsWith(`.${domain}`)
      );
      if (!isDomainApproved) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Validação assíncrona com verificação de DNS e restrição de saída segura
 */
export async function validateSafeExternalUrl(
  rawUrl: string,
  options: { enforceAllowlist?: boolean } = {}
): Promise<{ valid: boolean; reason?: string }> {
  const { enforceAllowlist = true } = options;

  if (!isAllowedWebhookUrl(rawUrl, enforceAllowlist)) {
    return {
      valid: false,
      reason: "URL bloqueada: protocolo inseguro, porta não padrão, domínio não homologado ou endereço restrito.",
    };
  }

  try {
    const parsed = new URL(rawUrl);
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

    // Deno runtime DNS resolution check
    // @ts-ignore Deno global
    if (typeof Deno !== "undefined" && typeof Deno.resolveDns === "function") {
      try {
        // @ts-ignore
        const aRecords = await Deno.resolveDns(hostname, "A").catch(() => []);
        // @ts-ignore
        const aaaaRecords = await Deno.resolveDns(hostname, "AAAA").catch(() => []);
        const allRecords = [...aRecords, ...aaaaRecords];

        if (allRecords.length === 0) {
          return { valid: false, reason: "Falha na resolução de DNS do destino." };
        }

        for (const record of allRecords) {
          if (isPrivateOrRestrictedIp(record)) {
            return { valid: false, reason: `Resolução DNS (${record}) aponta para IP interno ou restrito.` };
          }
        }
      } catch {
        return { valid: false, reason: "Erro ao resolver DNS do domínio (fail-closed)." };
      }
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: "Falha ao processar URL." };
  }
}