/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ActionExecutorRegistry,
  registerNfeActionHandlers,
  createDefaultActionExecutorRegistry,
} from '../../supabase/functions/_shared/ai/action-executor-registry';

describe('👑 WALLET CEO 3.0 — Hardening Final da Aprovação de NF-e (Gates 1 a 5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── TESTE 1: REGISTRO NO CANÔNICO ─────────────────────────────────────────
  it('GATE 1: deve registrar o handler "cadastrar_nfe" no registro padrão canônico', () => {
    const registry = createDefaultActionExecutorRegistry();
    expect(registry.has('cadastrar_nfe')).toBe(true);
  });

  // ── TESTE 2: AUTORIZAÇÃO E ISOLAMENTO MULTI-TENANT ────────────────────────
  it('GATE 1: deve rejeitar se workspaceId ou userId não estiverem no contexto', async () => {
    const registry = new ActionExecutorRegistry();
    registerNfeActionHandlers(registry);
    const handler = registry.get('cadastrar_nfe')!;

    const mockClient = {} as any;
    await expect(
      handler({}, { workspaceId: '', userId: '' } as any, mockClient)
    ).rejects.toThrow('workspaceId e userId são obrigatórios no contexto de execução.');
  });

  // ── TESTE 3: VALIDAÇÃO DE VALOR ───────────────────────────────────────────
  it('GATE 1: deve rejeitar se o valor total da NF-e for menor ou igual a zero', async () => {
    const registry = new ActionExecutorRegistry();
    registerNfeActionHandlers(registry);
    const handler = registry.get('cadastrar_nfe')!;

    const mockClient = {} as any;
    await expect(
      handler({ valor_total: 0 }, { workspaceId: 'ws-123', userId: 'user-456' } as any, mockClient)
    ).rejects.toThrow('Valor total da NF-e deve ser maior que zero.');
  });

  // ── TESTE 4: NÃO INVENTAR VENCIMENTOS FICTÍCIOS (GATE 4) ──────────────────
  it('GATE 4: deve REJEITAR NF-e sem vencimento comprovado (PROIBIDO INVENTAR 30 DIAS)', async () => {
    const registry = new ActionExecutorRegistry();
    registerNfeActionHandlers(registry);
    const handler = registry.get('cadastrar_nfe')!;

    const payloadSemVencimento = {
      chave_acesso: '31261117467515000107550020030898491343004765',
      numero_nota: '3089849',
      emitente: { cnpj: '17467515000107', razaoSocial: 'CAFE TRES CORACOES SA' },
      valores: { valorTotal: 528.76 },
      // Sem duplicatas e sem payload.data_vencimento
    };

    const mockClient = {
      rpc: vi.fn(),
    } as any;

    await expect(
      handler(payloadSemVencimento, { workspaceId: 'ws-123', userId: 'user-456' } as any, mockClient)
    ).rejects.toThrow('Data de vencimento não comprovada no documento fiscal. Conforme política de segurança financeira (Gate 4), é proibido atribuir vencimentos fictícios.');
  });

  // ── TESTE 5: MÚLTIPLAS PARCELAS / DUPLICATAS (GATES 1 & 4) ────────────────
  it('GATE 1 & 4: deve repassar múltiplas duplicatas para a RPC transacional PostgreSQL', async () => {
    const registry = new ActionExecutorRegistry();
    registerNfeActionHandlers(registry);
    const handler = registry.get('cadastrar_nfe')!;

    let rpcCalledWith: any = null;
    const mockClient: any = {
      rpc: vi.fn((fnName: string, args: any) => {
        if (fnName === 'rpc_aprovar_nfe_transacional') {
          rpcCalledWith = args;
          return Promise.resolve({
            data: {
              success: true,
              divida_id: 'divida-p1-id',
              dividas_ids: ['divida-p1-id', 'divida-p2-id', 'divida-p3-id'],
              status: 'criada_pendente',
              total_parcelas: 3,
              ja_existia: false,
              nf_compra_id: 'nf-compra-123',
            },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      }),
    };

    const payloadMultiplas = {
      chave_acesso: '31261117467515000107550020030898491343004765',
      numero_nota: '1001',
      emitente: { cnpj: '17467515000107', razaoSocial: 'CAFE TRES CORACOES SA' },
      valores: { valorTotal: 600.0 },
      duplicatas: [
        { numero: '001', vencimento: '2026-12-01', valor: 200.0 },
        { numero: '002', vencimento: '2026-12-15', valor: 200.0 },
        { numero: '003', vencimento: '2026-12-30', valor: 200.0 },
      ],
      itens: [{ codigoProduto: 'P01', descricao: 'Cafe Tradicional 500g', quantidade: 10, valorUnitario: 20, valorTotal: 200 }],
    };

    const res = await handler(
      payloadMultiplas,
      { workspaceId: 'ws-rodo', userId: 'user-heitor' } as any,
      mockClient,
    );

    expect(mockClient.rpc).toHaveBeenCalledWith('rpc_aprovar_nfe_transacional', expect.any(Object));
    expect(rpcCalledWith.p_workspace_id).toBe('ws-rodo');
    expect(rpcCalledWith.p_user_id).toBe('user-heitor');
    expect(rpcCalledWith.p_data_vencimento).toBe('2026-12-01');
    expect(rpcCalledWith.p_duplicatas.length).toBe(3);
    expect(rpcCalledWith.p_itens.length).toBe(1);

    expect(res.recordId).toBe('divida-p1-id');
    expect(res.data.status).toBe('criada_pendente');
    expect(res.data.totalParcelas).toBe(3);
    expect(res.data.dividasIds).toEqual(['divida-p1-id', 'divida-p2-id', 'divida-p3-id']);
  });

  // ── TESTE 6: PRESERVAR DÍVIDAS QUITADAS (GATE 2 & 3) ──────────────────────
  it('GATE 2 & 3: deve PRESERVAR dívida quitada quando a RPC retornar status "already_paid"', async () => {
    const registry = new ActionExecutorRegistry();
    registerNfeActionHandlers(registry);
    const handler = registry.get('cadastrar_nfe')!;

    const mockClient: any = {
      rpc: vi.fn((fnName: string) => {
        if (fnName === 'rpc_aprovar_nfe_transacional') {
          return Promise.resolve({
            data: {
              success: true,
              divida_id: 'divida-quitada-xodo-30out',
              status: 'already_paid',
              is_quitada: true,
              ja_existia: true,
              message: 'Documento fiscal vinculado com sucesso à dívida quitada existente, preservando o pagamento e histórico.',
            },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      }),
    };

    const payloadNfe235622 = {
      chave_acesso: '31261052315807000117550010002356221718206933',
      numero_nota: '235622',
      emitente: { cnpj: '52315807000117', razaoSocial: 'XODO FOODS E DISTRIBUICAO LTDA' },
      valores: { valorTotal: 658.14 },
      duplicatas: [{ numero: '001', vencimento: '2026-10-30', valor: 658.14 }],
    };

    const res = await handler(
      payloadNfe235622,
      { workspaceId: 'ws-rodo', userId: 'user-heitor' } as any,
      mockClient,
    );

    // Validações do Gate 3:
    expect(res.recordId).toBe('divida-quitada-xodo-30out');
    expect(res.data.status).toBe('already_paid');
    expect(res.data.isQuitada).toBe(true);
    expect(res.data.jaExistia).toBe(true);
  });

  // ── TESTE 7: DETECÇÃO DE SUSPEITA DE DUPLICIDADE (GATE 2) ─────────────────
  it('GATE 2: deve BLOQUEAR com 409 quando a RPC detectar suspeita de duplicidade', async () => {
    const registry = new ActionExecutorRegistry();
    registerNfeActionHandlers(registry);
    const handler = registry.get('cadastrar_nfe')!;

    const mockClient: any = {
      rpc: vi.fn((fnName: string) => {
        if (fnName === 'rpc_aprovar_nfe_transacional') {
          return Promise.resolve({
            data: null,
            error: {
              message: 'WALLET_AI_ACTION_SUSPECTED_DUPLICATE: Já existe uma dívida com valor de R$ 752.16 e vencimento em 2026-11-13 do fornecedor "XODO FOODS". Requer conferência humana.',
            },
          });
        }
        return Promise.resolve({ data: null, error: null });
      }),
    };

    const payloadSuspeito = {
      chave_acesso: '31261152315807000117550010002401189999999999',
      numero_nota: '99999',
      emitente: { cnpj: '52315807000117', razaoSocial: 'XODO FOODS E DISTRIBUICAO LTDA' },
      valores: { valorTotal: 752.16 },
      duplicatas: [{ numero: '001', vencimento: '2026-11-13', valor: 752.16 }],
    };

    await expect(
      handler(payloadSuspeito, { workspaceId: 'ws-rodo', userId: 'user-heitor' } as any, mockClient)
    ).rejects.toThrow('WALLET_AI_ACTION_SUSPECTED_DUPLICATE');
  });

  // ── TESTE 8: AUTORIZAÇÃO DE EXCEÇÕES - BLOQUEIO DE MEMBRO COMUM (GATE 3) ──
  it('GATE 3: deve BLOQUEAR com 403 se usuário comum (membro) tentar ignorar suspeita de duplicidade', async () => {
    const registry = new ActionExecutorRegistry();
    registerNfeActionHandlers(registry);
    const handler = registry.get('cadastrar_nfe')!;

    const mockClient: any = { rpc: vi.fn() };

    const payloadExcecao = {
      chave_acesso: '31261152315807000117550010002401189999999999',
      numero_nota: '99999',
      emitente: { cnpj: '52315807000117', razaoSocial: 'XODO FOODS' },
      valores: { valorTotal: 752.16 },
      duplicatas: [{ numero: '001', vencimento: '2026-11-13', valor: 752.16 }],
      ignorar_suspeita_duplicidade: true,
      justificativa_excecao: 'Compra legítima confirmada com o fornecedor.',
    };

    // Usuário com role "member" (não administrativo)
    await expect(
      handler(
        payloadExcecao,
        { workspaceId: 'ws-rodo', userId: 'user-garcom', role: 'member', isOwner: false } as any,
        mockClient,
      )
    ).rejects.toThrow('Apenas administradores (owner/admin) podem autorizar exceção de duplicidade financeira.');
  });

  // ── TESTE 9: AUTORIZAÇÃO DE EXCEÇÕES - EXIGE JUSTIFICATIVA >= 10 CARACTERES (GATE 3) ─
  it('GATE 3: deve BLOQUEAR com 400 se a justificativa de exceção tiver menos de 10 caracteres', async () => {
    const registry = new ActionExecutorRegistry();
    registerNfeActionHandlers(registry);
    const handler = registry.get('cadastrar_nfe')!;

    const mockClient: any = { rpc: vi.fn() };

    const payloadJustificativaCurta = {
      chave_acesso: '31261152315807000117550010002401189999999999',
      numero_nota: '99999',
      emitente: { cnpj: '52315807000117', razaoSocial: 'XODO FOODS' },
      valores: { valorTotal: 752.16 },
      duplicatas: [{ numero: '001', vencimento: '2026-11-13', valor: 752.16 }],
      ignorar_suspeita_duplicidade: true,
      justificativa_excecao: 'ok liberado', // Apenas 11 caracteres brutos, mas vamos testar com 'ok' (< 10)
    };
    payloadJustificativaCurta.justificativa_excecao = 'ok';

    await expect(
      handler(
        payloadJustificativaCurta,
        { workspaceId: 'ws-rodo', userId: 'user-heitor', role: 'admin', isOwner: true } as any,
        mockClient,
      )
    ).rejects.toThrow('Justificativa obrigatória (mínimo 10 caracteres) para autorizar exceção de duplicidade.');
  });

  // ── TESTE 10: AUTORIZAÇÃO DE EXCEÇÕES - SUCESSO QUANDO ADMIN COM JUSTIFICATIVA (GATE 3) ─
  it('GATE 3: deve PERMITIR ignorar suspeita quando executivo/admin enviar justificativa válida', async () => {
    const registry = new ActionExecutorRegistry();
    registerNfeActionHandlers(registry);
    const handler = registry.get('cadastrar_nfe')!;

    let rpcArgs: any = null;
    const mockClient: any = {
      rpc: vi.fn((_name: string, args: any) => {
        rpcArgs = args;
        return Promise.resolve({
          data: {
            success: true,
            divida_id: 'divida-liberada-id',
            status: 'criada_pendente',
            total_parcelas: 1,
            ja_existia: false,
          },
          error: null,
        });
      }),
    };

    const payloadValido = {
      chave_acesso: '31261152315807000117550010002401189999999999',
      numero_nota: '99999',
      emitente: { cnpj: '52315807000117', razaoSocial: 'XODO FOODS' },
      valores: { valorTotal: 752.16 },
      duplicatas: [{ numero: '001', vencimento: '2026-11-13', valor: 752.16 }],
      ignorar_suspeita_duplicidade: true,
      justificativa_excecao: 'Pedido extra de emergência entregue e faturado na mesma data.',
    };

    const res = await handler(
      payloadValido,
      { workspaceId: 'ws-rodo', userId: 'user-heitor', role: 'admin', isOwner: true } as any,
      mockClient,
    );

    expect(rpcArgs.p_ignorar_suspeita).toBe(true);
    expect(rpcArgs.p_justificativa_excecao).toBe('Pedido extra de emergência entregue e faturado na mesma data.');
    expect(res.data.status).toBe('criada_pendente');
  });

  // ── TESTE 11: TRANSAÇÃO REAL ATÔMICA POSTGRESQL (GATE 1) ──────────────────
  it('GATE 1: deve repassar erro de falha na RPC sem criar dados parciais', async () => {
    const registry = new ActionExecutorRegistry();
    registerNfeActionHandlers(registry);
    const handler = registry.get('cadastrar_nfe')!;

    const mockClient: any = {
      rpc: vi.fn(() => Promise.resolve({
        data: null,
        error: { message: 'Database transaction aborted: constraint violation' },
      })),
    };

    const payload = {
      chave_acesso: '31261117467515000107550020030898491343004765',
      numero_nota: '3089849',
      emitente: { cnpj: '17467515000107', razaoSocial: 'CAFE TRES CORACOES SA' },
      valores: { valorTotal: 528.76 },
      duplicatas: [{ numero: '001', vencimento: '2026-12-04', valor: 528.76 }],
    };

    await expect(
      handler(payload, { workspaceId: 'ws-rodo', userId: 'user-heitor' } as any, mockClient)
    ).rejects.toThrow('Falha na aprovação transacional de NF-e: Database transaction aborted');
  });

  // ── TESTE 12: SIMULAÇÃO CONTROLADA DA NF 3089849 (GATE 5) ─────────────────
  it('GATE 5: deve SIMULAR com dados controlados a aprovação da NF-e 3089849 (3 Corações, R$ 528,76) com idempotência', async () => {
    const registry = new ActionExecutorRegistry();
    registerNfeActionHandlers(registry);
    const handler = registry.get('cadastrar_nfe')!;

    const payloadSimulacao3089849 = {
      chave_acesso: '31261117467515000107550020030898491343004765',
      numero_nota: '3089849',
      emitente: {
        cnpj: '17467515000107',
        razaoSocial: 'TRES CORACOES ALIMENTOS S.A.',
      },
      valores: {
        valorTotal: 528.76,
        valorProdutos: 528.76,
      },
      duplicatas: [
        { numero: '001', vencimento: '2026-12-04', valor: 528.76 },
      ],
      itens: [
        {
          codigoProduto: '10001',
          descricao: 'CAFE EM GRAO ESPRESSO 1KG',
          ncm: '09012100',
          unidade: 'KG',
          quantidade: 10,
          valorUnitario: 52.876,
          valorTotal: 528.76,
        },
      ],
    };

    // 1ª Tentativa de Aprovação: criação com sucesso
    const mockClientPrimeiraVez: any = {
      rpc: vi.fn((_fn: string, args: any) => {
        expect(args.p_chave_acesso).toBe('31261117467515000107550020030898491343004765');
        expect(args.p_numero_nota).toBe('3089849');
        expect(args.p_valor_total).toBe(528.76);
        expect(args.p_data_vencimento).toBe('2026-12-04');
        return Promise.resolve({
          data: {
            success: true,
            divida_id: 'divida-simulada-3089849',
            dividas_ids: ['divida-simulada-3089849'],
            nf_compra_id: 'nf-compra-simulada-3089849',
            status: 'criada_pendente',
            total_parcelas: 1,
            ja_existia: false,
          },
          error: null,
        });
      }),
    };

    const res1 = await handler(
      payloadSimulacao3089849,
      { workspaceId: 'ws-rodo', userId: 'user-heitor', role: 'admin', isOwner: true } as any,
      mockClientPrimeiraVez,
    );

    // Validações estritas do Gate 5:
    expect(res1.recordId).toBe('divida-simulada-3089849');
    expect(res1.data.status).toBe('criada_pendente');
    expect(res1.data.jaExistia).toBe(false);
    expect(res1.data.totalParcelas).toBe(1);

    // 2ª Tentativa de Aprovação (Idempotência sem duplicação):
    const mockClientSegundaVez: any = {
      rpc: vi.fn((_fn: string, _args: any) => {
        return Promise.resolve({
          data: {
            success: true,
            divida_id: 'divida-simulada-3089849',
            status: 'already_exists',
            is_quitada: false,
            ja_existia: true,
            message: 'Documento fiscal vinculado à dívida pendente já existente.',
          },
          error: null,
        });
      }),
    };

    const res2 = await handler(
      payloadSimulacao3089849,
      { workspaceId: 'ws-rodo', userId: 'user-heitor', role: 'admin', isOwner: true } as any,
      mockClientSegundaVez,
    );

    expect(res2.recordId).toBe('divida-simulada-3089849');
    expect(res2.data.status).toBe('already_exists');
    expect(res2.data.jaExistia).toBe(true);
  });
});
