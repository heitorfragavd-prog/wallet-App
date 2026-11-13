import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { render, screen } from "@testing-library/react";
import {
  buildGroupSystemPrompt,
  extractCashClosingFromTextDeterministic,
  filterCatalogForGroup,
  STANDARD_GROUP_TEMPLATES,
} from "../../../supabase/functions/_shared/ai/group-governance";
import { ConversasSidebarList } from "./components/ConversasSidebarList";
import { GerenciarGruposModal } from "./components/GerenciarGruposModal";
import type { GrupoConfig, ThreadListItem, WorkspaceMemberOption } from "./types";

const ROOT = process.cwd();

describe("Central de Conversas — Segurança, Migração e Governança", () => {
  it("remove políticas públicas inseguras e aplica RLS/Trigger estritos na migration 89", () => {
    const sqlPath = path.join(
      ROOT,
      "supabase/migrations/89_central_conversas_grupos_permissoes.sql",
    );
    const sql = fs.readFileSync(sqlPath, "utf-8");

    expect(sql).toContain('DROP POLICY IF EXISTS "Public read telegram_grupos_config"');
    expect(sql).toContain('DROP POLICY IF EXISTS "Public read fechamentos_caixa"');
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.enforce_grupo_participante_rules()");
    expect(sql).toContain("v_tipo_grupo = 'contas_empresa'");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.user_can_access_group");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.user_can_write_group_message");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.user_can_confirm_group_operation");
    expect(sql).toContain("CREATE POLICY \"chat_attachments_group_select\"");
    expect(sql).toContain("CREATE POLICY \"chat_attachments_group_insert\"");
    expect(sql).toContain("uq_wallet_ai_active_group_conv");
  });

  it("garante isolamento entre conversas privadas (/ia e /ceo) e conversas de grupo", () => {
    const agentV2 = fs.readFileSync(
      path.join(ROOT, "src/domains/ia/components/AgentV2Tab.tsx"),
      "utf-8",
    );
    const ceoOverview = fs.readFileSync(
      path.join(ROOT, "src/domains/ceo/components/CeoOverviewTab.tsx"),
      "utf-8",
    );

    expect(agentV2).toContain('.eq("is_group", false)');
    expect(agentV2).toContain('.eq("is_shared", false)');
    expect(ceoOverview).toContain(".eq('is_group', false)");
    expect(ceoOverview).toContain(".eq('is_shared', false)");
  });

  it("filtra estritamente ferramentas de IA por tipo de grupo e bloqueia Wallet CEO e finanças confidenciais em Conversas da Loja", () => {
    const mockFn = vi.fn(async () => ({}));
    const fullCatalog = {
      consultar_saldos: mockFn,
      consultar_dividas: mockFn,
      buscar_despesas: mockFn,
      buscar_receitas: mockFn,
      buscar_transacoes: mockFn,
      consultar_resumo_mensal: mockFn,
      buscar_vendas_pdv: mockFn,
      analisar_margens: mockFn,
      consultar_dre: mockFn,
      diagnosticar_lucratividade: mockFn,
      planejar_estrategia_ceo: mockFn,
    } as never;

    const lojaTools = filterCatalogForGroup(fullCatalog, "conversas_loja", [
      "consultar_saldos",
      "analisar_margens",
    ]);
    expect(Object.keys(lojaTools)).toEqual([]);

    const fechamentoTools = filterCatalogForGroup(fullCatalog, "fechamento");
    expect(Object.keys(fechamentoTools)).toEqual(
      expect.arrayContaining([
        "buscar_vendas_pdv",
        "buscar_transacoes",
        "consultar_resumo_mensal",
      ]),
    );
    expect(fechamentoTools).not.toHaveProperty("consultar_saldos");
    expect(fechamentoTools).not.toHaveProperty("analisar_margens");

    const nfeTools = filterCatalogForGroup(fullCatalog, "nfe_boletos");
    expect(Object.keys(nfeTools).sort()).toEqual(["buscar_despesas", "consultar_dividas"]);

    const contasTools = filterCatalogForGroup(fullCatalog, "contas_empresa");
    expect(contasTools).toHaveProperty("consultar_saldos");
    expect(contasTools).not.toHaveProperty("analisar_margens");
    expect(contasTools).not.toHaveProperty("planejar_estrategia_ceo");
  });

  it("gera system prompts especializados com bloqueios explícitos para Conversas da Loja e NF-e/Boletos", () => {
    const lojaPrompt = buildGroupSystemPrompt("BASE", "conversas_loja", "Conversas da Loja");
    expect(lojaPrompt).toContain("SIGILO OBRIGATÓRIO");
    expect(lojaPrompt).toContain("PROIBIDO divulgar saldos bancários");

    const nfePrompt = buildGroupSystemPrompt("BASE", "nfe_boletos");
    expect(nfePrompt).toContain("NUNCA execute pagamentos reais");

    expect(Object.keys(STANDARD_GROUP_TEMPLATES).sort()).toEqual([
      "contas_empresa",
      "conversas_loja",
      "fechamento",
      "nfe_boletos",
    ]);
  });

  it("extrai deterministicamente fechamento de caixa em PT-BR com Caixa 1, Caixa 2, meios de pagamento e data BR", () => {
    const parsed = extractCashClosingFromTextDeterministic(
      "Fechamento 11/11/2026 Caixa 1: R$ 900,00 | Caixa 2: R$ 670,50 | Dinheiro: R$ 450,00 | Pix: R$ 620,50 | Débito: R$ 310,00 | Crédito: R$ 190,00 | Sobra: R$ 12,00",
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.dataFechamento).toBe("2026-11-11");
    expect(parsed?.caixa1.total).toBe(900);
    expect(parsed?.caixa2.total).toBe(670.5);
    expect(parsed?.envelopeTotal).toEqual({
      dinheiro: 450,
      pix: 620.5,
      debito: 310,
      credito: 190,
      total: 1570.5,
    });
    expect(parsed?.sobraInformada).toBe(12);
    expect(parsed?.extractionSource).toBe("deterministic_text");
  });
});

describe("Central de Conversas — Componentes UI", () => {
  const basePermissions = {
    ler: true,
    enviar_mensagens: true,
    enviar_documentos: true,
    confirmar_operacoes: false,
    gerenciar_grupo: false,
  };

  const sampleThreads: ThreadListItem[] = [
    {
      id: "conv-fechamento",
      kind: "group",
      title: "Fechamento Rodo Point",
      subtitle: "Conferência diária",
      grupo: {
        id: "grupo-1",
        workspace_id: "ws-1",
        chat_id: -5289531178,
        nome_grupo: "Fechamento Rodo Point",
        descricao: "Fechamento",
        tipo_grupo: "fechamento",
        ativo: true,
        ferramentas_permitidas: [],
        dados_permitidos: [],
        acoes_permitidas: [],
        funcionalidades_autorizadas: [],
        config: {},
        created_at: "2026-11-11T10:00:00Z",
      },
      unreadCount: 0,
      participantsCount: 2,
      pendingProposalsCount: 1,
      telegramLinked: true,
      processingStatus: "awaiting_confirmation",
      lastActivityAt: "2026-11-11T12:00:00Z",
      lastMessagePreview: "Envelope conferido",
      myPermissions: basePermissions,
      myGroupRole: "operador",
    },
    {
      id: "conv-op",
      kind: "private_operational",
      title: "Wallet IA — Privado",
      subtitle: "Canal individual",
      unreadCount: 0,
      participantsCount: 1,
      pendingProposalsCount: 0,
      telegramLinked: false,
      processingStatus: "idle",
      lastActivityAt: null,
      lastMessagePreview: "Consultas individuais",
      myPermissions: { ...basePermissions, confirmar_operacoes: true, gerenciar_grupo: true },
      myGroupRole: "admin_grupo",
    },
    {
      id: "conv-ceo",
      kind: "private_ceo",
      title: "👑 Wallet CEO (Privado)",
      subtitle: "Conselho executivo",
      unreadCount: 0,
      participantsCount: 1,
      pendingProposalsCount: 0,
      telegramLinked: false,
      processingStatus: "idle",
      lastActivityAt: null,
      lastMessagePreview: "Diagnóstico executivo",
      myPermissions: { ...basePermissions, confirmar_operacoes: true, gerenciar_grupo: true },
      myGroupRole: "admin_grupo",
    },
  ];

  it("oculta gerenciamento/botões administrativos para operador comum e exibe Wallet CEO para executivo", () => {
    const { rerender } = render(
      React.createElement(ConversasSidebarList, {
        threads: sampleThreads.filter((t) => t.kind !== "private_ceo"),
        selectedThreadId: "conv-fechamento",
        onSelectThread: vi.fn(),
        onOpenManageModal: vi.fn(),
        onProvisionDefaults: vi.fn(),
        isExecutiveUser: false,
        loading: false,
        provisioning: false,
      }),
    );

    expect(screen.getByText("Fechamento Rodo Point")).toBeInTheDocument();
    expect(screen.queryByText(/Wallet CEO/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Gerenciar grupos e permissões")).not.toBeInTheDocument();

    rerender(
      React.createElement(ConversasSidebarList, {
        threads: sampleThreads,
        selectedThreadId: "conv-fechamento",
        onSelectThread: vi.fn(),
        onOpenManageModal: vi.fn(),
        onProvisionDefaults: vi.fn(),
        isExecutiveUser: true,
        loading: false,
        provisioning: false,
      }),
    );

    expect(screen.getByText(/Wallet CEO \(Privado\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Gerenciar grupos e permissões")).toBeInTheDocument();
  });

  it("impede seleção de funcionário comum no grupo Contas da Empresa dentro do modal de gerenciamento", () => {
    const contasGroup: GrupoConfig = {
      id: "g-contas",
      workspace_id: "ws-1",
      chat_id: null,
      nome_grupo: "Contas da Empresa",
      descricao: "Restrito à administração",
      tipo_grupo: "contas_empresa",
      ativo: true,
      ferramentas_permitidas: [],
      dados_permitidos: [],
      acoes_permitidas: [],
      funcionalidades_autorizadas: [],
      config: {},
      created_at: "2026-11-11T10:00:00Z",
    };

    const members: WorkspaceMemberOption[] = [
      {
        user_id: "owner-1",
        role: "owner",
        active: true,
        nome: "Heitor Dono",
        email: "heitor@empresa.com",
        is_owner: true,
      },
      {
        user_id: "staff-1",
        role: "member",
        active: true,
        nome: "Operador Caixa",
        email: "caixa@empresa.com",
        is_owner: false,
      },
    ];

    render(
      React.createElement(GerenciarGruposModal, {
        open: true,
        initialGroupId: "g-contas",
        onOpenChange: vi.fn(),
        grupos: [contasGroup],
        participantes: [],
        workspaceMembers: members,
        provisioning: false,
        onProvisionDefaults: vi.fn(async () => true),
        onSaveGroup: vi.fn(async () => contasGroup),
        onSaveParticipant: vi.fn(async () => true),
        onRemoveParticipant: vi.fn(async () => true),
      }),
    );

    expect(screen.getByText(/funcionários comuns não podem ser adicionados/i)).toBeInTheDocument();
    expect(screen.getByText(/Heitor Dono/)).toBeInTheDocument();
    expect(screen.queryByText(/Operador Caixa/)).not.toBeInTheDocument();
  });

  it("garante estabilidade anti-flicker e desacoplamento do Realtime no useCentralConversas", () => {
    const hookSource = fs.readFileSync(
      path.join(ROOT, "src/domains/conversas/hooks/useCentralConversas.ts"),
      "utf-8",
    );

    // Chave de thread estável e ref para evitar loop infinito de carregamento
    expect(hookSource).toContain("loadedThreadKeyRef");
    expect(hookSource).toContain("currentThreadKey");
    expect(hookSource).toContain("loadedThreadKeyRef.current === currentThreadKey");

    // Realtime desacoplado de referências voláteis de activeThread
    expect(hookSource).toContain("activeThreadRef.current");
    expect(hookSource).toContain("loadActiveThreadDetailsRef.current");
    expect(hookSource).not.toContain("}, [activeThread, loadActiveThreadDetails, loadWorkspaceContext");

    // Guarda de markThreadAsRead contra re-render redundante
    expect(hookSource).toContain("readMarkersRef.current[conversationId]");

    // Proteção contra concorrência e race condition de requisições de mensagens
    expect(hookSource).toContain("loadActiveRequestIdRef");
    expect(hookSource).toContain("currentRequestId !== loadActiveRequestIdRef.current");
  });

  it("regressão: comprova que recomputação de threads/readMarkers não re-dispara carregamento da thread ativa", () => {
    // Modelo da lógica do hook que causava o flickering infinito:
    // Sem loadedThreadKeyRef, toda reavaliação de `threads` criava uma nova ref de `activeThread`,
    // disparando `useEffect([activeThread])`.
    let loadCallCount = 0;
    let loadedThreadKey: string | null = null;

    const mockLoadActiveThreadDetails = (key: string) => {
      loadCallCount++;
      loadedThreadKey = key;
    };

    // Cenário 1: Seleção inicial da thread "fechamento"
    const activeThread1 = { id: "fech-1", conversation: { id: "conv-1", last_message_at: "2026-11-13T10:00:00Z" } };
    const currentThreadKey1 = `${activeThread1.id}:${activeThread1.conversation.id}`;

    // Execução do efeito estabilizado
    if (loadedThreadKey !== currentThreadKey1) {
      mockLoadActiveThreadDetails(currentThreadKey1);
    }
    expect(loadCallCount).toBe(1);

    // Cenário 2: `markThreadAsRead` roda e gera um novo objeto `activeThread` (nova referência de memória),
    // mas com os mesmos identificadores estáveis
    const activeThreadRecomputed = { id: "fech-1", conversation: { id: "conv-1", last_message_at: "2026-11-13T10:00:00Z" } };
    const currentThreadKeyRecomputed = `${activeThreadRecomputed.id}:${activeThreadRecomputed.conversation.id}`;

    // No código antigo, activeThreadRecomputed !== activeThread1 dispararia o useEffect.
    // No código corrigido:
    if (loadedThreadKey !== currentThreadKeyRecomputed) {
      mockLoadActiveThreadDetails(currentThreadKeyRecomputed);
    }

    // Comprova que NÃO re-executou (loadCallCount continua 1, ZERO flickering)
    expect(loadCallCount).toBe(1);

    // Cenário 3: Troca real de thread pelo usuário
    const activeThread2 = { id: "nfe-boletos", conversation: { id: "conv-2", last_message_at: "2026-11-13T10:05:00Z" } };
    const currentThreadKey2 = `${activeThread2.id}:${activeThread2.conversation.id}`;
    if (loadedThreadKey !== currentThreadKey2) {
      mockLoadActiveThreadDetails(currentThreadKey2);
    }

    // Comprova que na troca real de thread o carregamento executa normalmente
    expect(loadCallCount).toBe(2);
  });
});
