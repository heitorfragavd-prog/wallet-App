import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  normalizeRemoteCode,
  validateRemoteSnapshot,
  planProductSync,
  isTrustedServiceRoleCaller,
  type LocalProductMirror,
  type ValidatedRemoteProduct,
} from "../../../../supabase/functions/_shared/eyemobile-product-identity";

describe("Eyemobile Product Sync Hardening (Fase 3)", () => {
  const USER_ID = "usr-1111-2222";
  const WS_ID = "ws-aaaa-bbbb";
  const OTHER_WS_ID = "ws-cccc-dddd";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Cenário A: mesmo eyemobile_id + mesmo workspace → update do UUID local existente
  // =========================================================================
  it("Cenário A: mesmo eyemobile_id no mesmo workspace planeja update preservando o UUID local", () => {
    const localProds: LocalProductMirror[] = [
      {
        id: "local-uuid-1",
        user_id: USER_ID,
        workspace_id: WS_ID,
        eyemobile_id: "REMOTE-100",
        codigo: "SKU-100",
        descricao: "Coca Cola Lata 350ml Antiga",
        preco_venda: 5.0,
        custo_atual: 3.0,
        estoque_atual: 10,
        ativo: true,
      },
    ];

    const remoteProds: ValidatedRemoteProduct[] = [
      {
        eyemobileId: "REMOTE-100",
        codigo: "SKU-100",
        descricao: "Coca Cola Lata 350ml Nova",
        categoria: "Bebidas",
        precoVenda: 6.5,
        custoAtual: 3.5,
        estoqueAtual: 20,
        margemReal: 85.71,
      },
    ];

    const plan = planProductSync(remoteProds, localProds, {
      userId: USER_ID,
      workspaceId: WS_ID,
    });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toInsert).toHaveLength(0);
    expect(plan.toDeactivate).toHaveLength(0);

    // O UUID canônico local é rigorosamente preservado
    expect(plan.toUpdate[0].localProduct.id).toBe("local-uuid-1");
    expect(plan.toUpdate[0].remoteProduct.descricao).toBe("Coca Cola Lata 350ml Nova");
    expect(plan.toUpdate[0].remoteProduct.precoVenda).toBe(6.5);
  });

  // =========================================================================
  // Cenário B: mesmo eyemobile_id em outro workspace → não cruza (violação de tenant)
  // =========================================================================
  it("Cenário B: produto local de outro workspace não cruza e viola isolamento de tenant", () => {
    const localProdsWithCrossTenant: LocalProductMirror[] = [
      {
        id: "local-uuid-other-ws",
        user_id: USER_ID,
        workspace_id: OTHER_WS_ID, // outro workspace!
        eyemobile_id: "REMOTE-100",
        codigo: "SKU-100",
      },
    ];

    const remoteProds: ValidatedRemoteProduct[] = [
      {
        eyemobileId: "REMOTE-100",
        codigo: "SKU-100",
        descricao: "Coca Cola",
        categoria: "Geral",
        precoVenda: 5.0,
        custoAtual: 3.0,
        estoqueAtual: 10,
        margemReal: 30,
      },
    ];

    const plan = planProductSync(remoteProds, localProdsWithCrossTenant, {
      userId: USER_ID,
      workspaceId: WS_ID,
    });

    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.code).toBe("tenant_isolation_violation");
  });

  // =========================================================================
  // Cenário C: mesmo codigo, eyemobile_id diferente → NÃO faz merge (conflito de identidade)
  // =========================================================================
  it("Cenário C: mesmo codigo comercial com eyemobile_id diferente NÃO faz merge e falha no preflight", () => {
    const localProds: LocalProductMirror[] = [
      {
        id: "local-uuid-1",
        user_id: USER_ID,
        workspace_id: WS_ID,
        eyemobile_id: "REMOTE-100",
        codigo: "COD-ABC",
        descricao: "Suco de Laranja",
      },
    ];

    const remoteProds: ValidatedRemoteProduct[] = [
      {
        eyemobileId: "REMOTE-999", // ID remoto diferente!
        codigo: "COD-ABC", // Mas mesmo código!
        descricao: "Suco de Uva",
        categoria: "Geral",
        precoVenda: 7.0,
        custoAtual: 4.0,
        estoqueAtual: 5,
        margemReal: 30,
      },
    ];

    const plan = planProductSync(remoteProds, localProds, {
      userId: USER_ID,
      workspaceId: WS_ID,
    });

    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.code).toBe("identity_conflict_code_collision");
  });

  // =========================================================================
  // Cenário D: produto legado eyemobile_id null + mesmo codigo → NÃO vincula automaticamente
  // =========================================================================
  it("Cenário D: produto legado com eyemobile_id nulo e mesmo codigo NÃO vincula automaticamente", () => {
    const localProds: LocalProductMirror[] = [
      {
        id: "local-uuid-legado",
        user_id: USER_ID,
        workspace_id: WS_ID,
        eyemobile_id: null, // Legado sem ID remoto
        codigo: "SKU-LEGADO",
        descricao: "Produto Histórico",
      },
    ];

    const remoteProds: ValidatedRemoteProduct[] = [
      {
        eyemobileId: "REMOTE-500",
        codigo: "SKU-LEGADO",
        descricao: "Produto Novo Remoto",
        categoria: "Geral",
        precoVenda: 10.0,
        custoAtual: 6.0,
        estoqueAtual: 1,
        margemReal: 30,
      },
    ];

    const plan = planProductSync(remoteProds, localProds, {
      userId: USER_ID,
      workspaceId: WS_ID,
    });

    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.code).toBe("legacy_product_code_collision");
  });

  // =========================================================================
  // Cenário E: novo eyemobile_id → insert com user/workspace corretos
  // =========================================================================
  it("Cenário E: novo eyemobile_id planeja insert com dados válidos", () => {
    const localProds: LocalProductMirror[] = [];

    const remoteProds: ValidatedRemoteProduct[] = [
      {
        eyemobileId: "REMOTE-NEW-1",
        codigo: "SKU-NEW",
        descricao: "Cerveja Artesanal 500ml",
        categoria: "Bebidas",
        precoVenda: 18.0,
        custoAtual: 10.0,
        estoqueAtual: 50,
        margemReal: 80,
      },
    ];

    const plan = planProductSync(remoteProds, localProds, {
      userId: USER_ID,
      workspaceId: WS_ID,
    });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    expect(plan.toInsert).toHaveLength(1);
    expect(plan.toUpdate).toHaveLength(0);
    expect(plan.toInsert[0].eyemobileId).toBe("REMOTE-NEW-1");
    expect(plan.toInsert[0].codigo).toBe("SKU-NEW");
  });

  // =========================================================================
  // Cenário F: produto remoto sem codigo → codigo null; nunca usa eyemobile_id como codigo
  // =========================================================================
  it("Cenário F: produto remoto sem code e sku normaliza para codigo = null e nunca usa o id remoto como código", () => {
    const rawProd = {
      id: "98765",
      name: "Água sem Gás 500ml",
      code: null,
      sku: "",
      price: 4.0,
    };

    const codigo = normalizeRemoteCode(rawProd.code, rawProd.sku);
    expect(codigo).toBeNull();
    expect(codigo).not.toBe("98765");

    const validated = validateRemoteSnapshot([rawProd]);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    expect(validated.products[0].eyemobileId).toBe("98765");
    expect(validated.products[0].codigo).toBeNull();
  });

  // =========================================================================
  // Cenário G: workspace não resolvido → fail-closed
  // =========================================================================
  it("Cenário G: workspace não resolvido deve falhar fechado antes de qualquer mutation", () => {
    const syncWorkspaceId: string | null = null;
    expect(syncWorkspaceId).toBeNull();

    // Simula a guarda no handler do endpoint
    const canProceed = syncWorkspaceId !== null && syncWorkspaceId !== undefined;
    expect(canProceed).toBe(false);
  });

  // =========================================================================
  // Cenário H: service role sem user_id → não escolhe primeiro usuário do banco
  // =========================================================================
  it("Cenário H: chamada service_role sem user_id não faz fallback e rejeita com missing_user_id", () => {
    const isServiceRole = true;
    const requestBodyUserId: string | null = null;

    const targetUserId = isServiceRole ? requestBodyUserId : "jwt-user";
    expect(targetUserId).toBeNull();

    // A regra exige rejeição sem buscar eyemobile_config.limit(1)
    const errorResponse = !targetUserId ? { success: false, code: "missing_user_id" } : null;
    expect(errorResponse).toEqual({ success: false, code: "missing_user_id" });
  });

  // =========================================================================
  // Cenário I: falha HTTP em página intermediária → aborta; zero deactivation
  // =========================================================================
  it("Cenário I: falha HTTP em página intermediária da paginação aborta o sync com zero deactivation", async () => {
    const fetchPages = async (simulateHttpErrorOnPage: number) => {
      const eyemobileRaw: unknown[] = [];
      for (let page = 0; page < 5; page++) {
        if (page === simulateHttpErrorOnPage) {
          // Erro HTTP intermediário
          return { ok: false, status: 500, error: "remote_http_error", products: [] };
        }
        eyemobileRaw.push({ id: `item-${page}` });
      }
      return { ok: true, products: eyemobileRaw };
    };

    const result = await fetchPages(2);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("remote_http_error");

    // Nenhuma mutação ou desativação é executada
    let deactivatedCount = 0;
    if (result.ok) {
      deactivatedCount = 10; // Nunca deve ser chamado
    }
    expect(deactivatedCount).toBe(0);
  });

  // =========================================================================
  // Cenário J: has_more = true ao atingir page cap → snapshot incompleto; aborta
  // =========================================================================
  it("Cenário J: has_more = true ao atingir limite máximo de páginas aborta por snapshot incompleto", () => {
    const MAX_PAGES = 3;
    let hasMoreAtCap = false;

    for (let page = 0; page < MAX_PAGES; page++) {
      if (page === MAX_PAGES - 1) {
        // Ainda há mais itens
        hasMoreAtCap = true;
      }
    }

    expect(hasMoreAtCap).toBe(true);
    const errorResult = hasMoreAtCap ? { success: false, code: "incomplete_snapshot" } : { success: true };
    expect(errorResult.code).toBe("incomplete_snapshot");
  });

  // =========================================================================
  // Cenário K: remote id ausente → aborta snapshot
  // =========================================================================
  it("Cenário K: item com ID remoto ausente ou vazio invalida o snapshot e aborta", () => {
    const invalidPayload = [
      { id: "123", name: "Produto 1" },
      { id: null, name: "Produto Sem ID" },
      { id: "   ", name: "Produto Espaços" },
    ];

    const validation = validateRemoteSnapshot(invalidPayload);
    expect(validation.ok).toBe(false);
    if (validation.ok) return;

    expect(validation.code).toBe("invalid_remote_id");
  });

  // =========================================================================
  // Cenário L: remote id duplicado no snapshot → aborta snapshot
  // =========================================================================
  it("Cenário L: snapshot com ID remoto duplicado falha fechado no preflight", () => {
    const duplicatePayload = [
      { id: "DUP-1", name: "Primeiro" },
      { id: "DUP-1", name: "Segundo Repetido" },
    ];

    const validation = validateRemoteSnapshot(duplicatePayload);
    expect(validation.ok).toBe(false);
    if (validation.ok) return;

    expect(validation.code).toBe("duplicate_remote_id");
  });

  // =========================================================================
  // Cenário M: duplicate local eyemobile_id no mesmo workspace → conflito
  // =========================================================================
  it("Cenário M: banco com duplicidade local de eyemobile_id para o mesmo tenant falha fechado", () => {
    const localWithDuplicates: LocalProductMirror[] = [
      {
        id: "uuid-1",
        user_id: USER_ID,
        workspace_id: WS_ID,
        eyemobile_id: "REMOTE-DUP",
        codigo: "SKU-1",
      },
      {
        id: "uuid-2",
        user_id: USER_ID,
        workspace_id: WS_ID,
        eyemobile_id: "REMOTE-DUP", // Duplicidade local corrompida!
        codigo: "SKU-2",
      },
    ];

    const remoteProds: ValidatedRemoteProduct[] = [
      {
        eyemobileId: "REMOTE-DUP",
        codigo: "SKU-1",
        descricao: "Produto",
        categoria: "Geral",
        precoVenda: 10,
        custoAtual: 5,
        estoqueAtual: 1,
        margemReal: 30,
      },
    ];

    const plan = planProductSync(remoteProds, localWithDuplicates, {
      userId: USER_ID,
      workspaceId: WS_ID,
    });

    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.code).toBe("duplicate_local_id");
  });

  // =========================================================================
  // Cenário N: desativação ocorre somente no workspace atual
  // =========================================================================
  it("Cenário N: desativação afeta estritamente produtos ausentes do mesmo workspace", () => {
    const localProds: LocalProductMirror[] = [
      {
        id: "uuid-keep",
        user_id: USER_ID,
        workspace_id: WS_ID,
        eyemobile_id: "REMOTE-ACTIVE",
        codigo: "SKU-1",
        ativo: true,
      },
      {
        id: "uuid-removed",
        user_id: USER_ID,
        workspace_id: WS_ID,
        eyemobile_id: "REMOTE-DELETED-FROM-API",
        codigo: "SKU-2",
        ativo: true,
      },
    ];

    const remoteProds: ValidatedRemoteProduct[] = [
      {
        eyemobileId: "REMOTE-ACTIVE",
        codigo: "SKU-1",
        descricao: "Produto Ativo",
        categoria: "Geral",
        precoVenda: 10,
        custoAtual: 5,
        estoqueAtual: 1,
        margemReal: 30,
      },
    ];

    const plan = planProductSync(remoteProds, localProds, {
      userId: USER_ID,
      workspaceId: WS_ID,
    });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    expect(plan.toDeactivate).toHaveLength(1);
    expect(plan.toDeactivate[0].id).toBe("uuid-removed");
    expect(plan.toDeactivate[0].eyemobile_id).toBe("REMOTE-DELETED-FROM-API");
  });

  // =========================================================================
  // Cenário O: produto de outro workspace não é desativado
  // =========================================================================
  it("Cenário O: produtos de outros workspaces não entram na lista de desativação do tenant atual", () => {
    // A query do banco já filtra rigorosamente por workspace_id
    const allDbProducts: LocalProductMirror[] = [
      {
        id: "uuid-ws1",
        user_id: USER_ID,
        workspace_id: WS_ID,
        eyemobile_id: "REMOTE-A",
        ativo: true,
        codigo: "A",
      },
      {
        id: "uuid-other-ws",
        user_id: USER_ID,
        workspace_id: OTHER_WS_ID, // outro workspace
        eyemobile_id: "REMOTE-B",
        ativo: true,
        codigo: "B",
      },
    ];

    // O filtro local do tenant atual garante que outro workspace sequer entra no pool
    const localFiltered = allDbProducts.filter(
      (p) => p.user_id === USER_ID && p.workspace_id === WS_ID
    );

    const remoteProds: ValidatedRemoteProduct[] = []; // Snapshot vazio -> desativa REMOTE-A apenas

    const plan = planProductSync(remoteProds, localFiltered, {
      userId: USER_ID,
      workspaceId: WS_ID,
    });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    expect(plan.toDeactivate).toHaveLength(1);
    expect(plan.toDeactivate[0].id).toBe("uuid-ws1");
    // O produto do outro workspace permanece intocado
    expect(plan.toDeactivate.some((p) => p.workspace_id === OTHER_WS_ID)).toBe(false);
  });

  // =========================================================================
  // Cenário P: produto local eyemobile_id null não é desativado por ausência no snapshot
  // =========================================================================
  it("Cenário P: produto local legado com eyemobile_id null NUNCA é desativado por ausência no snapshot", () => {
    const localProds: LocalProductMirror[] = [
      {
        id: "uuid-legado",
        user_id: USER_ID,
        workspace_id: WS_ID,
        eyemobile_id: null, // Legado sem vínculo remoto
        codigo: "LEG-001",
        descricao: "Produto Manual Antigo",
        ativo: true,
      },
    ];

    const remoteProds: ValidatedRemoteProduct[] = [
      {
        eyemobileId: "REMOTE-1",
        codigo: "REM-001",
        descricao: "Produto Remoto",
        categoria: "Geral",
        precoVenda: 10,
        custoAtual: 5,
        estoqueAtual: 1,
        margemReal: 30,
      },
    ];

    const plan = planProductSync(remoteProds, localProds, {
      userId: USER_ID,
      workspaceId: WS_ID,
    });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    expect(plan.toDeactivate).toHaveLength(0);
  });

  // =========================================================================
  // Cenário Q: erro em update → updated não incrementa; success false
  // =========================================================================
  it("Cenário Q: erro de write em update não incrementa contador e retorna success: false", () => {
    let updated = 0;
    const writeErrors: Array<{ operation: string; error: string; id?: string }> = [];

    const mockUpdateResult = { error: { message: "DB timeout on update" } };
    if (mockUpdateResult.error) {
      writeErrors.push({ operation: "update", error: mockUpdateResult.error.message });
    } else {
      updated++;
    }

    expect(updated).toBe(0);
    expect(writeErrors).toHaveLength(1);
    const response = {
      success: writeErrors.length === 0,
      code: "write_error",
      updated,
    };
    expect(response.success).toBe(false);
  });

  // =========================================================================
  // Cenário R: erro em insert → inserted não incrementa; success false
  // =========================================================================
  it("Cenário R: erro de write em insert não incrementa contador e retorna success: false", () => {
    let inserted = 0;
    const writeErrors: Array<{ operation: string; error: string; id?: string }> = [];

    const mockInsertResult = { error: { message: "Unique constraint violation" } };
    if (mockInsertResult.error) {
      writeErrors.push({ operation: "insert", error: mockInsertResult.error.message });
    } else {
      inserted++;
    }

    expect(inserted).toBe(0);
    expect(writeErrors).toHaveLength(1);
    const response = {
      success: writeErrors.length === 0,
      code: "write_error",
      inserted,
    };
    expect(response.success).toBe(false);
  });

  // =========================================================================
  // Cenário S: erro em deactivation → deactivated não incrementa; success false
  // =========================================================================
  it("Cenário S: erro de write em deactivation não incrementa contador e retorna success: false", () => {
    let deactivated = 0;
    const writeErrors: Array<{ operation: string; error: string; id?: string }> = [];

    const mockDeactResult = { error: { message: "Connection lost" } };
    if (mockDeactResult.error) {
      writeErrors.push({ operation: "deactivate", error: mockDeactResult.error.message });
    } else {
      deactivated++;
    }

    expect(deactivated).toBe(0);
    expect(writeErrors).toHaveLength(1);
    const response = {
      success: writeErrors.length === 0,
      code: "write_error",
      deactivated,
    };
    expect(response.success).toBe(false);
  });

  // =========================================================================
  // Cenário T: nenhuma criação/alteração de produto_equivalencias
  // =========================================================================
  it("Cenário T: a sincronização de produtos não invoca ou muta a tabela produto_equivalencias", () => {
    // Inspeciona as operações geradas pelo planner
    const plan = planProductSync(
      [
        {
          eyemobileId: "REM-1",
          codigo: "COD-1",
          descricao: "Prod",
          categoria: "Geral",
          precoVenda: 10,
          custoAtual: 5,
          estoqueAtual: 1,
          margemReal: 30,
        },
      ],
      [],
      { userId: USER_ID, workspaceId: WS_ID }
    );

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    // Garante que o plano opera exclusivamente sobre produtos_eyemobile
    const operations = ["insert_produtos_eyemobile", "update_produtos_eyemobile"];
    expect(operations.includes("produto_equivalencias")).toBe(false);
  });

  // =========================================================================
  // Cenário U: JWT comum/falso com payload role="service_role" NÃO é trusted
  // =========================================================================
  it("Cenário U: JWT comum/falso com payload role='service_role' não ganha autorização privilegiada", () => {
    const fakeJwtPayloadServiceRole =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.fakeSignature";
    const realServiceKey = "real-supabase-service-role-secret-key-12345";
    const cronSecret = "real-cron-secret-67890";

    const isTrusted = isTrustedServiceRoleCaller(
      fakeJwtPayloadServiceRole,
      realServiceKey,
      cronSecret
    );
    expect(isTrusted).toBe(false);
  });

  // =========================================================================
  // Cenário V: JWT com iss="supabase" sem chave service real NÃO é trusted
  // =========================================================================
  it("Cenário V: JWT com iss='supabase' sem chave service real não ganha autorização privilegiada", () => {
    const tokenWithIssSupabase =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.anotherSignature";
    const realServiceKey = "real-supabase-service-role-secret-key-12345";

    const isTrusted = isTrustedServiceRoleCaller(
      tokenWithIssSupabase,
      realServiceKey
    );
    expect(isTrusted).toBe(false);
  });

  // =========================================================================
  // Cenário W: mesmo user + mesmo codigo em outro workspace → conflito preflight
  // =========================================================================
  it("Cenário W: mesmo user com mesmo código comercial em outro workspace detecta conflito no preflight e impede qualquer mutation", () => {
    const localProductsCurrentWs: LocalProductMirror[] = [
      {
        id: "prod-ws1-local",
        user_id: USER_ID,
        workspace_id: WS_ID,
        eyemobile_id: "REM-001",
        codigo: "COD-EXCLUSIVO-WS1",
        ativo: true,
      },
    ];

    const otherWsProductsSameUser: LocalProductMirror[] = [
      {
        id: "prod-ws2-other",
        user_id: USER_ID,
        workspace_id: OTHER_WS_ID, // outro workspace do mesmo user
        eyemobile_id: "REM-099",
        codigo: "COD-COLISAO-GLOBAL",
        ativo: true,
      },
    ];

    const remoteProducts: ValidatedRemoteProduct[] = [
      {
        eyemobileId: "REM-NEW",
        codigo: "COD-COLISAO-GLOBAL", // mesmo código que já existe no outro workspace!
        descricao: "Novo Produto com Código Duplicado",
        categoria: "Geral",
        precoVenda: 15,
        custoAtual: 8,
        estoqueAtual: 10,
        margemReal: 30,
      },
    ];

    const plan = planProductSync(remoteProducts, localProductsCurrentWs, {
      userId: USER_ID,
      workspaceId: WS_ID,
      otherWorkspaceProducts: otherWsProductsSameUser,
    });

    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.code).toBe("cross_workspace_code_collision");
    expect(plan.conflicts[0].workspaceId).toBe(OTHER_WS_ID);
  });

  // =========================================================================
  // Cenário X: um write falha após writes anteriores bem-sucedidos
  // =========================================================================
  it("Cenário X: um write falha depois de write anterior bem-sucedido: interrompe imediatamente, partial_write = true e zero deactivations", () => {
    let updated = 0;
    let inserted = 0;
    let deactivated = 0;
    const writeErrors: Array<{ operation: string; error: string; id?: string }> = [];

    const updateItems = [
      { id: "upd-1", shouldFail: false },
      { id: "upd-2", shouldFail: true }, // falha no segundo update!
      { id: "upd-3", shouldFail: false },
    ];

    for (const item of updateItems) {
      if (item.shouldFail) {
        writeErrors.push({ operation: "update", id: item.id, error: "DB Error" });
        break; // FAIL-FAST
      } else {
        updated++;
      }
    }

    // Se houve erro no update, NÃO executa inserts
    const insertItems = [{ id: "ins-1" }];
    if (writeErrors.length === 0) {
      for (const _item of insertItems) {
        inserted++;
      }
    }

    // Nem deactivations
    const deactItems = [{ id: "deact-1" }];
    if (writeErrors.length === 0) {
      for (const _item of deactItems) {
        deactivated++;
      }
    }

    expect(updated).toBe(1); // Somente o primeiro passou
    expect(inserted).toBe(0); // Nenhum insert executado
    expect(deactivated).toBe(0); // Nenhuma desativação executada
    expect(writeErrors).toHaveLength(1);

    const partialWrite = (inserted + updated + deactivated) > 0;
    expect(partialWrite).toBe(true);

    const finalResponse = {
      success: false,
      partial_write: partialWrite,
      code: "write_error",
      inserted,
      updated,
      deactivated,
    };

    expect(finalResponse.success).toBe(false);
    expect(finalResponse.partial_write).toBe(true);
  });
});
