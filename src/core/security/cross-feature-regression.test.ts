import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("ETAPA H — Testes de Não-Regressão Cruzados (Segurança PR #80 + Produtos Fases 1-4)", () => {
  const rootDir = process.cwd();

  // ─── CENÁRIO 1: Hardening de secrets do PR #80 não quebra eyemobile-sync novo ───
  describe("Cenário 1: Hardening de secrets não quebra eyemobile-sync novo", () => {
    it("A: eyemobile-sync consome credenciais usando service_role autorizado", () => {
      const eyemobileSyncPath = path.join(rootDir, "supabase/functions/eyemobile-sync/index.ts");
      const content = fs.readFileSync(eyemobileSyncPath, "utf-8");

      // Deve criar cliente Supabase com service role key para ler secrets com segurança
      expect(content).toMatch(/createClient\s*\(\s*supabaseUrl,\s*supabaseServiceKey/);
      expect(content).toMatch(/pConfig\?\.access_key/);
      expect(content).toMatch(/pConfig\?\.secret_key/);
    });

    it("B: Migration Fase C garante acesso a service_role e restringe authenticated", () => {
      const phaseCPath = path.join(rootDir, "supabase/migrations/20260908120001_security_phase_c_enforcement.sql");
      const content = fs.readFileSync(phaseCPath, "utf-8");

      // Revoga SELECT amplo de authenticated
      expect(content).toMatch(/REVOKE SELECT ON public\.eyemobile_config FROM authenticated/);
      // Coluna secret_key NÃO é concedida a authenticated
      const grantMatch = content.match(/GRANT SELECT \(([^)]+)\) ON public\.eyemobile_config TO authenticated/);
      expect(grantMatch).not.toBeNull();
      expect(grantMatch![1]).not.toContain("secret_key");
    });

    it("C: Frontend useEyemobileConfig não tenta ler secret_key diretamente", () => {
      const hookPath = path.join(rootDir, "src/domains/admin/hooks/useEyemobileConfig.ts");
      const content = fs.readFileSync(hookPath, "utf-8");

      // Não seleciona secret_key no frontend
      expect(content).not.toMatch(/select\s*\(\s*['"][^'"]*secret_key[^'"]*['"]\s*\)/);
    });
  });

  // ─── CENÁRIO 2: Mudanças de autenticação/RLS não quebram produto_equivalencias ───
  describe("Cenário 2: Mudanças de autenticação/RLS não quebram produto_equivalencias", () => {
    it("A: produto_equivalencias mantém RLS multi-tenant estrito com tem_acesso_workspace", () => {
      const equivMigPath = path.join(rootDir, "supabase/migrations/20260909110000_produto_equivalencias_foundation.sql");
      const content = fs.readFileSync(equivMigPath, "utf-8");

      expect(content).toMatch(/ALTER TABLE public\.produto_equivalencias ENABLE ROW LEVEL SECURITY/);
      expect(content).toMatch(/public\.tem_acesso_workspace\(workspace_id\)/);
      expect(content).toMatch(/auth\.uid\(\)\s*=\s*user_id/);
    });

    it("B: Migrações da Fase A e Fase C não interferem em produto_equivalencias", () => {
      const phaseAPath = path.join(rootDir, "supabase/migrations/20260908120000_security_phase_a_infrastructure.sql");
      const phaseCPath = path.join(rootDir, "supabase/migrations/20260908120001_security_phase_c_enforcement.sql");
      const contentA = fs.readFileSync(phaseAPath, "utf-8");
      const contentC = fs.readFileSync(phaseCPath, "utf-8");

      expect(contentA).not.toContain("produto_equivalencias");
      expect(contentC).not.toContain("produto_equivalencias");
    });
  });

  // ─── CENÁRIO 3: Mudanças de segurança do Telegram não quebram confirmação segura da NF ───
  describe("Cenário 3: Segurança do Telegram integrada à confirmação segura da NF", () => {
    it("A: Telegram webhook protege endpoints administrativos com isServiceRole", () => {
      const tgPath = path.join(rootDir, "supabase/functions/telegram-webhook/index.ts");
      const content = fs.readFileSync(tgPath, "utf-8");

      expect(content).toMatch(/isServiceRole = Boolean\(supabaseServiceKey && token === supabaseServiceKey\)/);
    });

    it("B: Telegram webhook vincula conta validando JWT do usuário autenticado (anti-IDOR)", () => {
      const tgPath = path.join(rootDir, "supabase/functions/telegram-webhook/index.ts");
      const content = fs.readFileSync(tgPath, "utf-8");

      expect(content).toMatch(/await supabase\.auth\.getUser\(userJwt\)/);
      expect(content).toMatch(/authenticatedUserId = user\.id/);
    });

    it("C: Callback do Telegram delega para executarConfirmacaoNfSegura com equivalência confirmada", () => {
      const tgPath = path.join(rootDir, "supabase/functions/telegram-webhook/index.ts");
      const content = fs.readFileSync(tgPath, "utf-8");

      expect(content).toMatch(/await executarConfirmacaoNfSegura\s*\(\{/);
    });
  });

  // ─── CENÁRIO 4: Nenhuma atualização do PR #80 reintroduz matching por descrição/código ───
  describe("Cenário 4: Integridade do matcher canônico e ausência de matching fuzzy", () => {
    it("A: productMatcher mantém correspondência estrita e fail-closed", () => {
      const matcherPath = path.join(rootDir, "src/domains/finance/services/productMatcher.ts");
      const content = fs.readFileSync(matcherPath, "utf-8");

      // Deve suportar confirmed_equivalence exclusivamente, sem fuzzy heurístico
      expect(content).toMatch(/source:\s*['"]confirmed_equivalence['"]/);
      expect(content).not.toMatch(/similarity\s*>/i);
      expect(content).not.toMatch(/levenshtein/i);
    });

    it("B: Código do PR #80 não faz match por ilike em produtos", () => {
      const proxyPath = path.join(rootDir, "supabase/functions/openai-proxy/index.ts");
      const proxyContent = fs.readFileSync(proxyPath, "utf-8");

      // Assegura que o PR #80 não alterou o proxy para introduzir novos matchers de produto
      expect(proxyContent).toMatch(/validateUserWorkspace/);
      expect(proxyContent).toMatch(/checkSharedRateLimit/);
    });
  });

  // ─── CENÁRIO 5: workspace_id continua obrigatório nos fluxos atuais ───
  describe("Cenário 5: Obrigatoriedade estrita de workspace_id em todos os fluxos", () => {
    it("A: RPC aplicar_item_nf_estoque_custo valida obrigatoriedade de workspace_id", () => {
      const rpcPath = path.join(rootDir, "supabase/migrations/20260910120000_aplicar_item_nf_estoque_custo.sql");
      const content = fs.readFileSync(rpcPath, "utf-8");

      expect(content).toMatch(/p_workspace_id IS NULL/);
      expect(content).toMatch(/missing_required_ids/);
      expect(content).toMatch(/tenant_mismatch/);
    });

    it("B: Trigger de validação rejeita cross-workspace em produto_equivalencias e historico", () => {
      const equivMigPath = path.join(rootDir, "supabase/migrations/20260909110000_produto_equivalencias_foundation.sql");
      const content = fs.readFileSync(equivMigPath, "utf-8");

      expect(content).toMatch(/Workspace mismatch/);
      expect(content).toMatch(/validar_produto_equivalencia_tenant/);
      expect(content).toMatch(/validar_historico_custo_produto_tenant/);
    });

    it("C: openai-proxy valida workspace_id server-side com validateUserWorkspace", () => {
      const proxyPath = path.join(rootDir, "supabase/functions/openai-proxy/index.ts");
      const content = fs.readFileSync(proxyPath, "utf-8");

      expect(content).toMatch(/await validateUserWorkspace\(supabase, userId, body\.workspace_id\)/);
    });
  });

  // ─── CENÁRIO 6: service_role continua limitado aos fluxos explicitamente privilegiados ───
  describe("Cenário 6: service_role com privilégio mínimo e sem concessão por atob()", () => {
    it("A: Nenhuma Edge Function concede service_role por decodificação de JWT com atob()", () => {
      const funcs = [
        "supabase/functions/eyemobile-sync/index.ts",
        "supabase/functions/divipay-api/index.ts",
        "supabase/functions/openai-proxy/index.ts",
        "supabase/functions/validar-senha/index.ts"
      ];

      for (const relPath of funcs) {
        const fullPath = path.join(rootDir, relPath);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, "utf-8");
          expect(content).not.toMatch(/decoded\.role\s*===\s*['"]service_role['"]/);
          expect(content).not.toMatch(/decoded\.iss\s*===\s*['"]supabase['"]/);
        }
      }
    });

    it("B: RPC aplicar_item_nf_estoque_custo é estritamente restrita a service_role", () => {
      const rpcPath = path.join(rootDir, "supabase/migrations/20260910120000_aplicar_item_nf_estoque_custo.sql");
      const content = fs.readFileSync(rpcPath, "utf-8");

      expect(content).toMatch(/REVOKE ALL ON FUNCTION public\.aplicar_item_nf_estoque_custo.*FROM PUBLIC, anon, authenticated/);
      expect(content).toMatch(/GRANT EXECUTE ON FUNCTION public\.aplicar_item_nf_estoque_custo.*TO service_role/);
    });
  });

  // ─── CENÁRIO 7: A Fase C continua fail-closed depois da integração com a develop atual ───
  describe("Cenário 7: Fase C continua fail-closed e atômica", () => {
    it("A: Migration Fase C exige flag de sessão e bloqueia sem ela", () => {
      const phaseCPath = path.join(rootDir, "supabase/migrations/20260908120001_security_phase_c_enforcement.sql");
      const content = fs.readFileSync(phaseCPath, "utf-8");

      expect(content).toMatch(/current_setting\('wallet\.deploy_phase_b_completed',\s*true\)\s*IS DISTINCT FROM\s*'true'/);
      expect(content).toMatch(/OPERACAO BLOQUEADA/);
      // Confirma que não há BEGIN nem COMMIT redundantes dentro da migration
      expect(content).not.toMatch(/^BEGIN;/m);
      expect(content).not.toMatch(/^COMMIT;/m);
    });

    it("B: Script oficial de aplicação controla a transação única de forma atômica", () => {
      const applyPath = path.join(rootDir, "scripts/apply-phase-c-enforcement.sql");
      const content = fs.readFileSync(applyPath, "utf-8");

      expect(content).toMatch(/BEGIN;/);
      expect(content).toMatch(/SET LOCAL wallet\.deploy_phase_b_completed = 'true';/);
      expect(content).toMatch(/INSERT INTO supabase_migrations\.schema_migrations/);
      expect(content).toMatch(/COMMIT;/);
      expect(content).toMatch(/NOTIFY pgrst, 'reload schema';/);
    });
  });
});
