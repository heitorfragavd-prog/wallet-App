import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";

// Leitura da migration 110 para análise estática e sintática
const migration110Path = "supabase/migrations/110_compras_rls_e_autorizacao_estrita.sql";
const migration110Sql = existsSync(migration110Path)
  ? readFileSync(migration110Path, "utf-8")
  : "";

describe("Etapa 4D - Gate 2, Gate 3, Gate 4: RLS, Autorização Estrita e Bloqueio de Incompletos", () => {
  it("Gate 2: Migration 110 revoga expressamente todas as políticas permissivas legadas de compras", () => {
    expect(migration110Sql).toContain('DROP POLICY IF EXISTS "compras_config_auth" ON public.compras_config;');
    expect(migration110Sql).toContain('DROP POLICY IF EXISTS "compras_calendario_auth" ON public.compras_fornecedores_calendario;');
    expect(migration110Sql).toContain('DROP POLICY IF EXISTS "compras_prod_ref_auth" ON public.compras_produtos_referencia;');
    expect(migration110Sql).toContain('DROP POLICY IF EXISTS "compras_pedidos_auth" ON public.compras_pedidos;');
    expect(migration110Sql).toContain('DROP POLICY IF EXISTS "compras_itens_auth" ON public.compras_pedidos_itens;');
  });

  it("Gate 7: Cria índice único de unicidade atômica para itens de conferência de estoque", () => {
    expect(migration110Sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS uk_compras_conf_itens_produto");
    expect(migration110Sql).toContain("ON public.compras_estoque_conferencias_itens (conferencia_id, produto_nome);");
  });

  it("Gate 3: gerar_sugestoes_compras_dia bloqueia chamadas anônimas e valida role service_role/postgres", () => {
    expect(migration110Sql).toContain("current_user = 'postgres' OR COALESCE(auth.role(), '') = 'service_role'");
    expect(migration110Sql).toContain("RAISE EXCEPTION 'Acesso negado: operação requer usuário autenticado ou contexto de serviço seguro'");
    expect(migration110Sql).toContain("public.is_workspace_executive(p_workspace_id, v_caller_id)");
  });

  it("Gate 4: aprovar_pedido_compras bloqueia pedidos incompletos e sem contagem sem justificativa expressa", () => {
    expect(migration110Sql).toContain("v_resumo_itens.itens_pendentes > 0 OR v_pedido.status IN ('aguardando_estoque', 'estoque_incompleto')");
    expect(migration110Sql).toContain("NOT COALESCE(p_permitir_incompleto, FALSE)");
    expect(migration110Sql).toContain("Não é permitido aprovar pedido com estoque incompleto");
    expect(migration110Sql).toContain("length(trim(p_justificativa_incompleto)) < 5");
    expect(migration110Sql).toContain("Aprovação de pedido com estoque incompleto exige justificativa administrativa obrigatória");
  });

  it("Gate 4: aprovar_pedido_compras bloqueia pedidos cancelados, enviados e com itens negativos", () => {
    expect(migration110Sql).toContain("v_pedido.status = 'cancelado'");
    expect(migration110Sql).toContain("v_pedido.status = 'enviado'");
    expect(migration110Sql).toContain("v_resumo_itens.itens_negativos > 0");
    expect(migration110Sql).toContain("v_resumo_itens.total_itens = 0");
  });

  it("Gate 4: aprovar_pedido_compras suporta verificação de concorrência otimista (p_expected_updated_at)", () => {
    expect(migration110Sql).toContain("p_expected_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NULL");
    expect(migration110Sql).toContain("date_trunc('milliseconds', v_pedido.updated_at) <> date_trunc('milliseconds', p_expected_updated_at)");
    expect(migration110Sql).toContain("Conflito de concorrência: o pedido foi alterado por outro usuário");
  });

  it("Gate 7: registrar_item_conferencia_estoque executa UPSERT atômico que substitui (não soma) correções", () => {
    expect(migration110Sql).toContain("FUNCTION public.registrar_item_conferencia_estoque");
    expect(migration110Sql).toContain("ON CONFLICT (conferencia_id, produto_nome) DO UPDATE");
    expect(migration110Sql).toContain("quantidade_informada = EXCLUDED.quantidade_informada");
  });

  it("Gate 7/12: registrar_item_conferencia_estoque protege pedidos já aprovados ou enviados como imutáveis", () => {
    expect(migration110Sql).toContain("v_pedido_status IN ('aprovado', 'enviado', 'recebido')");
    expect(migration110Sql).toContain("'pedido_protegido', TRUE");
    expect(migration110Sql).toContain("permanece protegido contra alterações");
  });
});
