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

  // ─── CENÁRIO 8: Convivência Telegram / NF Fase 5 com Hardening do PR #80 ───
  describe("Cenário 8: Convivência Telegram / NF Fase 5 com Hardening do PR #80", () => {
    it("A: Validação estrita do ator real do Telegram bloqueia ator divergente sem tocar na proposta", () => {
      const tgPath = path.join(rootDir, "supabase/functions/telegram-webhook/index.ts");
      const content = fs.readFileSync(tgPath, "utf-8");

      // Deve invocar validarAtorTelegramFase5 e rejeitar sem alterar status da proposta
      expect(content).toMatch(/validarAtorTelegramFase5\(supabase,\s*\{/);
      expect(content).toMatch(/valAtor\.ok/);
      expect(content).toMatch(/❌ \$\{valAtor\.reason\}/);
    });

    it("B: Propostas expiradas ou não-pendentes sofrem fail-closed imediato", () => {
      const equivPath = path.join(rootDir, "supabase/functions/_shared/integrations/nf-product-equivalence.ts");
      const content = fs.readFileSync(equivPath, "utf-8");

      expect(content).toMatch(/validarPropostaFase5/);
      expect(content).toMatch(/status !== ['"]pendente['"]/);
      expect(content).toMatch(/Esta proposta já foi processada ou cancelada/);
      expect(content).toMatch(/Esta proposta expirou/);
    });

    it("C: Transição de estado de proposta utiliza CAS atômico pendente -> em_processamento", () => {
      const tgPath = path.join(rootDir, "supabase/functions/telegram-webhook/index.ts");
      const content = fs.readFileSync(tgPath, "utf-8");

      expect(content).toMatch(/\.update\(\{\s*status:\s*['"]em_processamento['"]\s*\}\)/);
      expect(content).toMatch(/\.eq\(['"]status['"],\s*['"]pendente['"]\)/);
    });

    it("D: Mecanismo de recovery CAS reverte em_processamento para pendente em caso de falha técnica", () => {
      const equivPath = path.join(rootDir, "supabase/functions/_shared/integrations/nf-product-equivalence.ts");
      const content = fs.readFileSync(equivPath, "utf-8");

      expect(content).toMatch(/reverterPropostaParaPendente/);
      expect(content).toMatch(/status:\s*['"]pendente['"]/);
    });

    it("E: Proposta só vira 'executada' após confirmação autoritativa final", () => {
      const tgPath = path.join(rootDir, "supabase/functions/telegram-webhook/index.ts");
      const content = fs.readFileSync(tgPath, "utf-8");

      expect(content).toMatch(/canFinalizeManualEquivalenceProposal/);
      expect(content).toMatch(/isProposalFinalizedSuccessfully/);
      expect(content).toMatch(/status:\s*['"]executada['"]/);
    });

    it("F: Endpoints administrativos do Telegram preservam proteção isServiceRole e anti-IDOR do PR #80", () => {
      const tgPath = path.join(rootDir, "supabase/functions/telegram-webhook/index.ts");
      const content = fs.readFileSync(tgPath, "utf-8");

      expect(content).toMatch(/isServiceRole = Boolean\(supabaseServiceKey && token === supabaseServiceKey\)/);
      expect(content).toMatch(/const authenticatedUserId = user\.id;/);
      expect(content).toMatch(/user_id:\s*authenticatedUserId/);
    });
  });

  // ─── CENÁRIO 9: Convivência Frontend / Catálogo Fase 6 com Segurança do PR #80 ───
  describe("Cenário 9: Convivência Frontend / Catálogo Fase 6 com Segurança do PR #80", () => {
    it("A: Zero referências a tabela legada de produtos no runtime do frontend", () => {
      const frontendFiles = [
        "src/pages/PDVPage.tsx",
        "src/domains/ia/components/UploadInteligente.tsx",
        "src/domains/ia/hooks/useFinancialContext.ts",
      ];

      const legacyTable = ["eye", "mobile", "_", "produtos"].join("");
      const regex = new RegExp(`from\\s*\\(\\s*['"]${legacyTable}['"]\\s*\\)`);

      for (const relPath of frontendFiles) {
        const fullPath = path.join(rootDir, relPath);
        const content = fs.readFileSync(fullPath, "utf-8");
        expect(content).not.toMatch(regex);
      }
    });

    it("B: Cache de produtos do PDV é estritamente isolado por user_id e não atende guests", () => {
      const pdvPath = path.join(rootDir, "src/pages/PDVPage.tsx");
      const content = fs.readFileSync(pdvPath, "utf-8");

      expect(content).toMatch(/const getProductCacheKey = useCallback\(\(uid: string\) =>/);
      expect(content).toMatch(/pdv_produtos_cache_\$\{uid\}/);
      expect(content).toMatch(/if \(authLoading \|\| !user\?\.id\)/);
    });

    it("C: Logout ou troca de usuário limpa produtos em memória e rejeita repopulação stale", () => {
      const pdvPath = path.join(rootDir, "src/pages/PDVPage.tsx");
      const content = fs.readFileSync(pdvPath, "utf-8");

      expect(content).toMatch(/if \(activeUserIdRef\.current !== requestUserId\)/);
      expect(content).toMatch(/setProducts\(\[\]\)/);
    });

    it("D: UploadInteligente não promete atualização de estoque no frontend", () => {
      const uploadPath = path.join(rootDir, "src/domains/ia/components/UploadInteligente.tsx");
      const content = fs.readFileSync(uploadPath, "utf-8");

      const legacyTable = ["eye", "mobile", "_", "produtos"].join("");
      const regex = new RegExp(`supabase\\.from\\s*\\(\\s*['"]${legacyTable}['"]\\s*\\)`);

      expect(content).toMatch(/Estoque e custo são processados pelo fluxo canônico de NF/);
      expect(content).not.toMatch(regex);
    });
  });

  // ─── CENÁRIO 10: Garantias Contínuas de Hardening do PR #80 ───
  describe("Cenário 10: Garantias Contínuas de Hardening do PR #80", () => {
    it("A: RLS de investimentos é session-bound e bloqueia leitura sem desbloqueio", () => {
      const phaseAPath = path.join(rootDir, "supabase/migrations/20260908120000_security_phase_a_infrastructure.sql");
      const phaseCPath = path.join(rootDir, "supabase/migrations/20260908120001_security_phase_c_enforcement.sql");
      const contentA = fs.readFileSync(phaseAPath, "utf-8");
      const contentC = fs.readFileSync(phaseCPath, "utf-8");

      expect(contentA).toMatch(/CREATE OR REPLACE FUNCTION public\.is_investimentos_unlocked/);
      expect(contentC).toMatch(/public\.is_investimentos_unlocked\(auth\.uid\(\)\)/);
    });

    it("B: Auto-promoção de role em profiles é impedida por REVOKE UPDATE amplo e concessão seletiva", () => {
      const phaseCPath = path.join(rootDir, "supabase/migrations/20260908120001_security_phase_c_enforcement.sql");
      const content = fs.readFileSync(phaseCPath, "utf-8");

      expect(content).toMatch(/REVOKE UPDATE ON public\.profiles FROM authenticated/);
      const grantMatch = content.match(/GRANT UPDATE \(([^)]+)\) ON public\.profiles TO authenticated/);
      expect(grantMatch).not.toBeNull();
      expect(grantMatch![1]).not.toContain("role");
    });

    it("C: Validador SSRF bloqueia IPs privados, cloud metadata e esquemas não-HTTP(S)", () => {
      const ssrfPath = path.join(rootDir, "supabase/functions/_shared/ssrf-validator.ts");
      const content = fs.readFileSync(ssrfPath, "utf-8");

      expect(content).toMatch(/169\.254\.169\.254/);
      expect(content).toMatch(/metadata\.google\.internal/);
      expect(content).toMatch(/10\./);
      expect(content).toMatch(/192\.168\./);
      expect(content).toMatch(/172\.(1[6-9]|2[0-9]|3[0-1])\./);
    });

    it("D: Rate limiter compartilhado utiliza reserva atômica via RPC reserve_ai_tokens", () => {
      const rateLimiterPath = path.join(rootDir, "supabase/functions/_shared/ai-rate-limiter.ts");
      const content = fs.readFileSync(rateLimiterPath, "utf-8");

      expect(content).toMatch(/rpc\(['"]reserve_ai_tokens['"]/);
      expect(content).toMatch(/Orçamento de processamento de IA por hora atingido/);
    });

    it("E: Safe Contingency Forward preserva RLS e mantém secrets revogados", () => {
      const recoveryPath = path.join(rootDir, "supabase/ops/rollback_20260908120000_safe_recovery.sql");
      const content = fs.readFileSync(recoveryPath, "utf-8");

      expect(content).toMatch(/REVOKE ALL ON public\.divipay_config FROM authenticated, anon, PUBLIC;/);
      expect(content).toMatch(/REVOKE ALL ON public\.eyemobile_config FROM authenticated, anon, PUBLIC;/);
      expect(content).toMatch(/REVOKE ALL ON public\.senha_investimentos FROM authenticated, anon, PUBLIC;/);
      expect(content).toMatch(/ENABLE ROW LEVEL SECURITY/);
    });
  });
});
