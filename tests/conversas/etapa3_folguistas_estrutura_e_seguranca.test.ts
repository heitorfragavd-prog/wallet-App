// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  buildGroupSystemPrompt,
  filterCatalogForGroup,
  normalizeOperationalGroupType,
  STANDARD_GROUP_TEMPLATES,
  SENSITIVE_COMPANY_FINANCIAL_TOOLS,
  CEO_EXCLUSIVE_TOOL_NAMES,
} from "../../supabase/functions/_shared/ai/group-governance";
import { GROUP_TYPE_META, OperationalGroupType } from "../../src/domains/conversas/types";

const ROOT = process.cwd();

describe("Etapa 3A — Grupo Folguistas Rodo Point: Estrutura, Governança e Segurança", () => {
  it("migration 93 define a constraint atualizada de tipo_grupo com 'folguistas' e seed idempotente", () => {
    const migrationPath = path.join(
      ROOT,
      "supabase/migrations/93_folguistas_grupo_central_conversas.sql",
    );
    expect(fs.existsSync(migrationPath)).toBe(true);

    const sql = fs.readFileSync(migrationPath, "utf-8");
    expect(sql).toContain("chk_telegram_grupos_config_tipo_grupo");
    expect(sql).toContain(
      "CHECK (tipo_grupo IN ('fechamento', 'nfe_boletos', 'contas_empresa', 'conversas_loja', 'folguistas'))",
    );
    expect(sql).toContain("INSERT INTO public.telegram_grupos_config");
    expect(sql).toContain("👥 Folguistas Rodo Point");
    expect(sql).toContain("INSERT INTO public.grupo_participantes");
    expect(sql).toContain("INSERT INTO public.wallet_ai_conversations");
  });

  it("migration 93 rollback restaura a constraint original e limpa dados de folguistas com segurança", () => {
    const rollbackPath = path.join(
      ROOT,
      "supabase/migrations/rollback/93_folguistas_grupo_central_conversas.down.sql",
    );
    expect(fs.existsSync(rollbackPath)).toBe(true);

    const rollbackSql = fs.readFileSync(rollbackPath, "utf-8");
    expect(rollbackSql).toContain("DELETE FROM public.wallet_ai_conversations");
    expect(rollbackSql).toContain("DELETE FROM public.grupo_participantes");
    expect(rollbackSql).toContain("DELETE FROM public.telegram_grupos_config");
    expect(rollbackSql).toContain(
      "CHECK (tipo_grupo IN ('fechamento', 'nfe_boletos', 'contas_empresa', 'conversas_loja'))",
    );
  });

  it("normaliza variações textuais de folguistas e escalas para o tipo canônico 'folguistas'", () => {
    expect(normalizeOperationalGroupType("folguistas")).toBe("folguistas");
    expect(normalizeOperationalGroupType("folguista")).toBe("folguistas");
    expect(normalizeOperationalGroupType("escala_fim_de_semana")).toBe("folguistas");
    expect(normalizeOperationalGroupType("dia_de_folga")).toBe("folguistas");
    expect(normalizeOperationalGroupType("Grupo Folguistas Rodo Point")).toBe("folguistas");
  });

  it("bloqueia estritamente ferramentas financeiras sensíveis e ferramentas exclusivas do CEO no grupo folguistas", () => {
    const mockHandler = vi.fn(async () => ({}));
    const fullCatalog = {
      // Ferramentas permitidas
      consultar_rotinas: mockHandler,
      // Ferramentas financeiras sensíveis da empresa
      consultar_saldos: mockHandler,
      consultar_dividas: mockHandler,
      buscar_despesas: mockHandler,
      buscar_receitas: mockHandler,
      buscar_transacoes: mockHandler,
      consultar_resumo_mensal: mockHandler,
      consultar_analise_comercial_vendas: mockHandler,
      // Ferramentas exclusivas do CEO
      consultar_resumo_executivo_ceo: mockHandler,
      consultar_analise_despesas_ceo: mockHandler,
      consultar_oportunidades_ceo: mockHandler,
      propor_experimento_comercial: mockHandler,
    } as never;

    const filteredCatalog = filterCatalogForGroup(fullCatalog, "folguistas");

    // Somente ferramentas autorizadas devem passar
    expect(filteredCatalog).toHaveProperty("consultar_rotinas");

    // Nenhuma ferramenta CEO deve passar
    for (const ceoTool of CEO_EXCLUSIVE_TOOL_NAMES) {
      expect(filteredCatalog).not.toHaveProperty(ceoTool);
    }

    // Nenhuma ferramenta financeira confidencial deve passar
    for (const sensitiveTool of SENSITIVE_COMPANY_FINANCIAL_TOOLS) {
      expect(filteredCatalog).not.toHaveProperty(sensitiveTool);
    }
  });

  it("injeta regra de sigilo obrigatório no prompt do sistema para o grupo folguistas", () => {
    const prompt = buildGroupSystemPrompt("BASE_PROMPT", "folguistas", "Folguistas Rodo Point");
    expect(prompt).toContain("BASE_PROMPT");
    expect(prompt).toContain("FOLGUISTAS RODO POINT & ESCALAS");
    expect(prompt).toContain("SIGILO OBRIGATÓRIO");
    expect(prompt).toContain("TERMINANTEMENTE PROIBIDO expor dados financeiros estratégicos da empresa");
  });

  it("contém metadados completos de UI em GROUP_TYPE_META para 'folguistas'", () => {
    const testType: OperationalGroupType = "folguistas";
    expect(testType).toBe("folguistas");

    const tpl = STANDARD_GROUP_TEMPLATES.folguistas;
    expect(tpl).toBeDefined();
    expect(tpl.tipo_grupo).toBe("folguistas");
    expect(tpl.nome_grupo).toBe("Folguistas Rodo Point");
    expect(tpl.restritoAdmins).toBe(false);

    const meta = GROUP_TYPE_META.folguistas;
    expect(meta).toBeDefined();
    expect(meta.label).toBe("Folguistas Rodo Point");
    expect(meta.shortLabel).toBe("Folguistas");
    expect(meta.emoji).toBe("👥");
    expect(meta.badgeClass).toContain("purple");
    expect(meta.defaultCapabilities.length).toBeGreaterThanOrEqual(3);
    expect(meta.quickPrompts.length).toBeGreaterThanOrEqual(2);
  });

  it("garante que o handler do Edge Function orquestrador provisiona todos os 5 grupos operacionais padrão", () => {
    const handlerPath = path.join(
      ROOT,
      "supabase/functions/wallet-ai-orchestrator/handler.ts",
    );
    const handlerContent = fs.readFileSync(handlerPath, "utf-8");

    // Deve incluir 'folguistas' na lista de provisionamento
    expect(handlerContent).toMatch(
      /for\s*\(\s*const\s+tipo\s+of\s*\[[^\]]*"folguistas"[^\]]*\]\s*as\s+OperationalGroupType\[\]\)/,
    );
  });

  it("preserva intacta a correção anti-flickering e de estabilidade do PR #206 no useCentralConversas", () => {
    const hookPath = path.join(
      ROOT,
      "src/domains/conversas/hooks/useCentralConversas.ts",
    );
    const hookContent = fs.readFileSync(hookPath, "utf-8");

    // Valida as âncoras essenciais do anti-flickering de PR #206
    expect(hookContent).toContain("loadedThreadKeyRef");
    expect(hookContent).toContain("currentThreadKey");
    expect(hookContent).toContain("readMarkersRef");
    expect(hookContent).toContain("loadActiveRequestIdRef");
    expect(hookContent).toContain("activeThreadRef.current");
  });
});
