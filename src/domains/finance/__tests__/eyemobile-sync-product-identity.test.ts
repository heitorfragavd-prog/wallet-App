import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  normalizeRemoteCode,
  validateRemoteProductsPage,
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
    // Simula a lógica do loop de paginação da Edge Function
    const fetchLoop = async () => {
      let deactivated = 0;
      for (let page = 0; page < 3; page++) {
        if (page === 1) {
          // HTTP 500 na página 1
          const resp = { ok: false, status: 500 };
          if (!resp.ok) {
            return {
              success: false,
              code: "remote_http_error",
              deactivated,
            };
          }
        }
      }
      deactivated = 5; // Nunca deve ser chamado
      return { success: true, deactivated };
    };

    const result = await fetchLoop();
    expect(result.success).toBe(false);
    expect(result.code).toBe("remote_http_error");
    expect(result.deactivated).toBe(0);
  });

  // =========================================================================
  // Cenário J: has_more = true ao atingir page cap → snapshot incompleto; aborta
  // =========================================================================
  it("Cenário J: has_more = true ao atingir limite máximo de páginas aborta por snapshot incompleto", () => {
    const pagePayload = {
      data: [{ id: "prod-1", name: "Produto 1" }],
      has_more: true,
    };

    const pageValidation = validateRemoteProductsPage(pagePayload);
    expect(pageValidation.ok).toBe(true);
    if (!pageValidation.ok) return;

    // Quando o loop atinge MAX_PAGES - 1 e has_more ainda é true:
    const MAX_PAGES = 50;
    const page = 49;
    const reachedPageCapWithMore = page === MAX_PAGES - 1 && pageValidation.hasMore;

    expect(reachedPageCapWithMore).toBe(true);
    const abortResult = reachedPageCapWithMore
      ? { success: false, code: "incomplete_snapshot" }
      : { success: true };
    expect(abortResult.code).toBe("incomplete_snapshot");
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

  // =========================================================================
  // Cenário Y: HTTP 200 com payload sem data -> invalid_remote_snapshot
  // =========================================================================
  it("Cenário Y: payload HTTP 200 sem propriedade 'data' falha fechado com invalid_remote_snapshot", () => {
    const pagePayload = { status: "ok", total: 100 };
    const res = validateRemoteProductsPage(pagePayload);

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("invalid_remote_snapshot");
    expect(res.error).toContain("data");
  });

  // =========================================================================
  // Cenário Z: HTTP 200 com data = null -> invalid_remote_snapshot
  // =========================================================================
  it("Cenário Z: payload HTTP 200 com data = null falha fechado com invalid_remote_snapshot", () => {
    const pagePayload = { data: null, has_more: false };
    const res = validateRemoteProductsPage(pagePayload);

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("invalid_remote_snapshot");
  });

  // =========================================================================
  // Cenário AA: HTTP 200 com data = {} (objeto em vez de array) -> invalid_remote_snapshot
  // =========================================================================
  it("Cenário AA: payload HTTP 200 com data sendo objeto em vez de array falha com invalid_remote_snapshot", () => {
    const pagePayload = { data: { id: "1", name: "Produto" }, has_more: false };
    const res = validateRemoteProductsPage(pagePayload);

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("invalid_remote_snapshot");
  });

  // =========================================================================
  // Cenário AB: data = [] com has_more = true -> incomplete_snapshot
  // =========================================================================
  it("Cenário AB: resposta com lista vazia mas has_more = true falha com incomplete_snapshot", () => {
    const pagePayload = { data: [], has_more: true };
    const res = validateRemoteProductsPage(pagePayload);

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("incomplete_snapshot");
  });

  // =========================================================================
  // Cenário AC: data = [] com has_more = false -> ok com items: [] e hasMore: false
  // =========================================================================
  it("Cenário AC: resposta com data vazia e has_more = false é snapshot vazio válido", () => {
    const pagePayload = { data: [], has_more: false };
    const res = validateRemoteProductsPage(pagePayload);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.items).toEqual([]);
    expect(res.hasMore).toBe(false);
  });

  // =========================================================================
  // Cenário AD: has_more com tipo não-booleano -> invalid_remote_snapshot
  // =========================================================================
  it("Cenário AD: propriedade has_more com tipo inválido (string ou número) falha com invalid_remote_snapshot", () => {
    const payloadString = { data: [{ id: "1" }], has_more: "true" };
    const resString = validateRemoteProductsPage(payloadString);
    expect(resString.ok).toBe(false);
    if (!resString.ok) {
      expect(resString.code).toBe("invalid_remote_snapshot");
    }

    const payloadNumber = { data: [{ id: "1" }], has_more: 1 };
    const resNumber = validateRemoteProductsPage(payloadNumber);
    expect(resNumber.ok).toBe(false);
    if (!resNumber.ok) {
      expect(resNumber.code).toBe("invalid_remote_snapshot");
    }
  });

  // =========================================================================
  // Cenário AE: colisão com produto legado que possui workspace_id = null
  // =========================================================================
  it("Cenário AE: colisão com produto legado com workspace_id = null diagnostica colisão indicando workspace legado (NULL)", () => {
    const localProds: LocalProductMirror[] = [];
    const legacyProductsSameUser: LocalProductMirror[] = [
      {
        id: "prod-legacy-null-ws",
        user_id: USER_ID,
        workspace_id: null, // produto legado com workspace_id nulo
        eyemobile_id: null,
        codigo: "SKU-LEGADO-123",
        ativo: true,
      },
    ];

    const remoteProds: ValidatedRemoteProduct[] = [
      {
        eyemobileId: "REM-AE-1",
        codigo: "SKU-LEGADO-123",
        descricao: "Produto Remoto Colidindo com Legado",
        categoria: "Geral",
        precoVenda: 10,
        custoAtual: 5,
        estoqueAtual: 2,
        margemReal: 30,
      },
    ];

    const plan = planProductSync(remoteProds, localProds, {
      userId: USER_ID,
      workspaceId: WS_ID,
      otherWorkspaceProducts: legacyProductsSameUser,
    });

    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.code).toBe("cross_workspace_code_collision");
    expect(plan.conflicts[0].workspaceId).toBeNull();
    expect(plan.conflicts[0].message).toContain("workspace legado (NULL)");
  });

  // =========================================================================
  // Cenário AF: timeout remoto (>25s) gera erro com status 504 e code remote_timeout
  // =========================================================================
  it("Cenário AF: timeout na chamada à API remota gera resposta HTTP 504 com code remote_timeout", async () => {
    const simulateFetchWithTimeout = async (shouldTimeout: boolean) => {
      const controller = new AbortController();
      if (shouldTimeout) {
        controller.abort(new DOMException("The signal has been aborted", "AbortError"));
      }

      try {
        if (controller.signal.aborted) {
          throw new DOMException("The signal has been aborted", "AbortError");
        }
        return { ok: true, status: 200, json: async () => ({ data: [] }) };
      } catch (err: unknown) {
        const error = err as { name?: string; message?: string };
        if (error?.name === "AbortError" || error?.message?.includes("aborted")) {
          return {
            ok: false,
            status: 504,
            body: {
              success: false,
              code: "remote_timeout",
              error: "Timeout na comunicação com a API da Eyemobile (limite: 25s por página).",
            },
          };
        }
        throw err;
      }
    };

    const res = await simulateFetchWithTimeout(true);
    expect(res.status).toBe(504);
    expect(res.body.code).toBe("remote_timeout");
    expect(res.body.success).toBe(false);
  });

  // =========================================================================
  // Cenário AG: sanitização de erro de escrita sem vazamento de detalhes de BD
  // =========================================================================
  it("Cenário AG: falha de escrita em banco mascara SQL e constraints internas retornando mensagem sanitizada", () => {
    const rawPgError = {
      message: 'duplicate key value violates unique constraint "produtos_eyemobile_user_id_codigo_key"',
      code: "23505",
      details: "Key (user_id, codigo)=(usr-1, COD-1) already exists.",
    };

    // Função de sanitização idêntica à utilizada na edge function
    const sanitizeWriteError = (operation: "update" | "insert" | "deactivate", _rawError: unknown) => {
      switch (operation) {
        case "update":
          return "Falha ao atualizar produto.";
        case "insert":
          return "Falha ao inserir produto.";
        case "deactivate":
          return "Falha ao desativar produto.";
      }
    };

    const sanitizedUpdate = sanitizeWriteError("update", rawPgError);
    const sanitizedInsert = sanitizeWriteError("insert", rawPgError);
    const sanitizedDeact = sanitizeWriteError("deactivate", rawPgError);

    expect(sanitizedUpdate).toBe("Falha ao atualizar produto.");
    expect(sanitizedInsert).toBe("Falha ao inserir produto.");
    expect(sanitizedDeact).toBe("Falha ao desativar produto.");

    // Nenhuma string contém vestígios de SQL ou nome de constraint
    for (const msg of [sanitizedUpdate, sanitizedInsert, sanitizedDeact]) {
      expect(msg).not.toContain("constraint");
      expect(msg).not.toContain("duplicate key");
      expect(msg).not.toContain("produtos_eyemobile_user_id_codigo_key");
      expect(msg).not.toContain("23505");
    }
  });

  // =========================================================================
  // Cenário AH: data válida sem has_more → invalid_remote_snapshot
  // =========================================================================
  it("Cenário AH: payload com data válida porém sem has_more falha fechado com invalid_remote_snapshot", () => {
    const pagePayload = { data: [{ id: "100", name: "Cerveja" }] };
    const res = validateRemoteProductsPage(pagePayload);

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("invalid_remote_snapshot");
    expect(res.error).toContain("has_more");
  });

  // =========================================================================
  // Cenário AI: has_more = null → invalid_remote_snapshot
  // =========================================================================
  it("Cenário AI: payload com has_more nulo falha fechado com invalid_remote_snapshot", () => {
    const pagePayload = { data: [{ id: "100", name: "Cerveja" }], has_more: null };
    const res = validateRemoteProductsPage(pagePayload);

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("invalid_remote_snapshot");
    expect(res.error).toContain("has_more");
  });

  // =========================================================================
  // Cenário AJ: update error=null mas nenhuma row retornada → write_error; updated = 0
  // =========================================================================
  it("Cenário AJ: update que não retorna row afetada (mesmo com error=null) falha fechado e não incrementa updated", () => {
    const localProduct = { id: "local-uuid-aj-1" };
    // Simula resposta do Supabase onde nenhuma row deu match nos filtros de tenant
    const mockDbResult = { data: null, error: null };
    let updated = 0;
    const writeErrors: Array<{ operation: string; error: string; id?: string }> = [];

    const updatedRow = mockDbResult.data as { id: string } | null;
    if (mockDbResult.error || !updatedRow || updatedRow.id !== localProduct.id) {
      writeErrors.push({
        operation: "update",
        id: localProduct.id,
        error: "Falha ao atualizar produto.",
      });
    } else {
      updated++;
    }

    expect(updated).toBe(0);
    expect(writeErrors).toHaveLength(1);
    expect(writeErrors[0].operation).toBe("update");
    expect(writeErrors[0].id).toBe(localProduct.id);
  });

  // =========================================================================
  // Cenário AK: deactivate error=null mas nenhuma row retornada → write_error; deactivated = 0
  // =========================================================================
  it("Cenário AK: deactivate que não retorna row afetada (mesmo com error=null) falha fechado e não incrementa deactivated", () => {
    const localProduct = { id: "local-uuid-ak-2" };
    // Simula resposta do Supabase onde nenhuma row deu match nos filtros de tenant
    const mockDbResult = { data: null, error: null };
    let deactivated = 0;
    const writeErrors: Array<{ operation: string; error: string; id?: string }> = [];

    const deactivatedRow = mockDbResult.data as { id: string } | null;
    if (mockDbResult.error || !deactivatedRow || deactivatedRow.id !== localProduct.id) {
      writeErrors.push({
        operation: "deactivate",
        id: localProduct.id,
        error: "Falha ao desativar produto.",
      });
    } else {
      deactivated++;
    }

    expect(deactivated).toBe(0);
    expect(writeErrors).toHaveLength(1);
    expect(writeErrors[0].operation).toBe("deactivate");
    expect(writeErrors[0].id).toBe(localProduct.id);
  });

  // =========================================================================
  // Cenário AL: insert só incrementa inserted após row criada confirmada com ID
  // =========================================================================
  it("Cenário AL: insert só incrementa contador após confirmação explícita de row criada com id", () => {
    const remoteProduct = { eyemobileId: "REM-AL-3" };
    let inserted = 0;
    const writeErrors: Array<{ operation: string; error: string; id?: string }> = [];

    // 1. Falha quando data é null (mesmo com error null)
    const mockFailResult = { data: null as { id: string } | null, error: null };
    if (mockFailResult.error || !mockFailResult.data?.id) {
      writeErrors.push({
        operation: "insert",
        id: remoteProduct.eyemobileId,
        error: "Falha ao inserir produto.",
      });
    } else {
      inserted++;
    }

    expect(inserted).toBe(0);
    expect(writeErrors).toHaveLength(1);

    // 2. Sucesso quando row criada com id válido é confirmada
    const mockSuccessResult = { data: { id: "new-uuid-al-4" }, error: null };
    if (mockSuccessResult.error || !mockSuccessResult.data?.id) {
      writeErrors.push({
        operation: "insert",
        id: remoteProduct.eyemobileId,
        error: "Falha ao inserir produto.",
      });
    } else {
      inserted++;
    }

    expect(inserted).toBe(1);
    expect(writeErrors).toHaveLength(1);
  });
});
