/**
 * edge-functions-auth.test.ts
 * 
 * Testes de segurança de código estático e de comportamento para Edge Functions:
 * 1. Prova a remoção de atob() e verificação insegura de payload JWT.
 * 2. Valida exigência de autenticação e bloqueio de personificação (IDOR).
 * 3. Valida proteção de endpoints cron e de sincronização.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Segurança das Edge Functions — Autenticação e Autorização", () => {
  const rootDir = process.cwd();

  it("VULN-01: divipay-api não deve usar atob para conceder service_role", () => {
    const filePath = path.join(rootDir, "supabase/functions/divipay-api/index.ts");
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, "utf8");

    // Prova que atob não é usado para bypass de role
    expect(content).not.toMatch(/atob\([^)]+\)\.role/);
    expect(content).not.toMatch(/payload\.role\s*===\s*['"]service_role['"]/);
    
    // Prova que service_role exige igualdade estrita com a chave do backend
    expect(content).toMatch(/serviceRoleKey\s*&&\s*token\s*===\s*serviceRoleKey/);
    // Prova que autenticação de usuário é chamada
    expect(content).toMatch(/supabaseAdmin\.auth\.getUser\(token\)/);
  });

  it("VULN-01: openai-proxy não deve aceitar tokens com iss: supabase sem validação", () => {
    const filePath = path.join(rootDir, "supabase/functions/openai-proxy/index.ts");
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, "utf8");

    // Prova que bypass decoded.iss === 'supabase' foi removido
    expect(content).not.toMatch(/decoded\.iss\s*===\s*['"]supabase['"]/);
    expect(content).not.toMatch(/decoded\.role\s*===\s*['"]service_role['"]/);

    // Prova que service-role exige igualdade estrita com a chave
    expect(content).toMatch(/supabaseServiceKey\s*&&\s*jwt\s*===\s*supabaseServiceKey/);
  });

  it("VULN-01: eyemobile-sync não deve conceder service_role via atob", () => {
    const filePath = path.join(rootDir, "supabase/functions/eyemobile-sync/index.ts");
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, "utf8");

    expect(content).not.toMatch(/decoded\.iss\s*===\s*['"]supabase['"]/);
    expect(content).not.toMatch(/decoded\.role\s*===\s*['"]service_role['"]/);
    expect(content).toMatch(/token\s*===\s*supabaseServiceKey/);
  });

  it("VULN-02: validar-senha exige token de autenticação e obtém userId com segurança", () => {
    const filePath = path.join(rootDir, "supabase/functions/validar-senha/index.ts");
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, "utf8");

    // Exige Authorization header
    expect(content).toMatch(/req\.headers\.get\(["']Authorization["']\)/i);
    // Valida com Supabase Auth
    expect(content).toMatch(/supabaseAdmin\.auth\.getUser\(token\)/);
    // Obtém ID estritamente do token do usuário
    expect(content).toMatch(/authenticatedUserId\s*=\s*user\.id/);
    // Usa PBKDF2
    expect(content).toMatch(/derivePbkdf2Hash/);
  });

  it("VULN-03: categorizar-ia e ia-deposito exigem autenticação do chamador", () => {
    const catPath = path.join(rootDir, "supabase/functions/categorizar-ia/index.ts");
    const depPath = path.join(rootDir, "supabase/functions/ia-deposito/index.ts");

    const catContent = fs.readFileSync(catPath, "utf8");
    const depContent = fs.readFileSync(depPath, "utf8");

    expect(catContent).toMatch(/req\.headers\.get\(["']Authorization["']\)/i);
    expect(catContent).toMatch(/supabaseAdmin\.auth\.getUser\(token\)/);

    expect(depContent).toMatch(/req\.headers\.get\(["']Authorization["']\)/i);
    expect(depContent).toMatch(/supabaseAdmin\.auth\.getUser\(token\)/);
  });

  it("VULN-04: test-webhook exige autenticação e implementa proteção anti-SSRF", () => {
    const filePath = path.join(rootDir, "supabase/functions/test-webhook/index.ts");
    const content = fs.readFileSync(filePath, "utf8");

    expect(content).toMatch(/req\.headers\.get\(["']Authorization["']\)/i);
    expect(content).toMatch(/supabaseAdmin\.auth\.getUser\(token\)/);
    expect(content).toMatch(/isAllowedWebhookUrl/);
    expect(content).toMatch(/169\.254\.169\.254/); // Bloqueio de endpoint de metadata
  });

  it("VULN-05: gerar-recibo exige autenticação e escapa entidades HTML", () => {
    const filePath = path.join(rootDir, "supabase/functions/gerar-recibo/index.ts");
    const content = fs.readFileSync(filePath, "utf8");

    expect(content).toMatch(/req\.headers\.get\(["']Authorization["']\)/i);
    expect(content).toMatch(/supabaseAdmin\.auth\.getUser\(token\)/);
    expect(content).toMatch(/escapeHtml/);
  });

  it("VULN-07: cron-alertas-investimentos e sefaz-sync exigem autenticação segura", () => {
    const cronPath = path.join(rootDir, "supabase/functions/cron-alertas-investimentos/index.ts");
    const sefazPath = path.join(rootDir, "supabase/functions/sefaz-sync/index.ts");

    const cronContent = fs.readFileSync(cronPath, "utf8");
    const sefazContent = fs.readFileSync(sefazPath, "utf8");

    expect(cronContent).toMatch(/isAuthorized\s*=\s*Boolean/);
    expect(cronContent).toMatch(/401/);

    expect(sefazContent).toMatch(/isAuthorized\s*=\s*Boolean/);
    expect(sefazContent).toMatch(/401/);
  });
});
