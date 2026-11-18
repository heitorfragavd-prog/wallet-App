/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ActionExecutorRegistry,
  registerNfeActionHandlers,
  createDefaultActionExecutorRegistry,
} from '../../supabase/functions/_shared/ai/action-executor-registry';

describe('👑 WALLET CEO 3.0 — Gates 1 a 7: Executor Financeiro e Segurança de NF-e', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── TESTE 1: REGISTRO NO CANÔNICO ─────────────────────────────────────────
  it('GATE 1: deve registrar o handler "cadastrar_nfe" no registro padrão canônico', () => {
    const registry = createDefaultActionExecutorRegistry();
    expect(registry.has('cadastrar_nfe')).toBe(true);
  });

  // ── TESTE 2: AUTORIZAÇÃO E ISOLAMENTO MULTI-TENANT ────────────────────────
  it('GATE 1 & 5: deve rejeitar se workspaceId ou userId não estiverem no contexto', async () => {
    const registry = new ActionExecutorRegistry();
    registerNfeActionHandlers(registry);
    const handler = registry.get('cadastrar_nfe')!;

    const mockClient = {} as any;
    await expect(
      handler({}, { workspaceId: '', userId: '' } as any, mockClient)
    ).rejects.toThrow('workspaceId e userId são obrigatórios no contexto de execução.');
  });

  // ── TESTE 3: VALIDAÇÃO DE VALOR ───────────────────────────────────────────
  it('GATE 1 & 5: deve rejeitar se o valor total da NF-e for menor ou igual a zero', async () => {
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
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [] }),
    } as any;

    await expect(
      handler(payloadSemVencimento, { workspaceId: 'ws-123', userId: 'user-456' } as any, mockClient)
    ).rejects.toThrow('Data de vencimento não comprovada no documento fiscal. Conforme política de segurança financeira (Gate 4), é proibido atribuir vencimentos fictícios.');
  });

  // ── TESTE 5: MÚLTIPLAS PARCELAS / DUPLICATAS (GATE 4) ────────────────────
  it('GATE 4: deve fatiar NF-e com múltiplas duplicatas em parcelas individuais com parent_id', async () => {
    const registry = new ActionExecutorRegistry();
    registerNfeActionHandlers(registry);
    const handler = registry.get('cadastrar_nfe')!;

    const parcelasCriadas: any[] = [];
    const mockClient: any = {
      from: vi.fn((table: string) => {
        if (table === 'dividas') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [] }), // Sem duplicatas anteriores
            insert: vi.fn((rows: any[]) => {
              const row = rows[0];
              const id = `divida-parcela-${parcelasCriadas.length + 1}`;
              parcelasCriadas.push({ id, ...row });
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id }, error: null }),
                }),
              };
            }),
          };
        }
        if (table === 'notas_fiscais_compra') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            insert: vi.fn(() => ({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'nf-compra-123' }, error: null }),
              }),
            })),
          };
        }
        if (table === 'nf_itens') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [] }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === 'gmail_mensagens_processadas') {
          return {
            update: vi.fn(() => ({
              eq: vi.fn().mockReturnThis(),
              contains: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
          };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [] }) };
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
    };

    const res = await handler(
      payloadMultiplas,
      { workspaceId: 'ws-rodo', userId: 'user-heitor' } as any,
      mockClient,
    );

    expect(res.data.totalParcelas).toBe(3);
    expect(parcelasCriadas.length).toBe(3);

    // Parcela 1
    expect(parcelasCriadas[0].valor_total).toBe(200.0);
    expect(parcelasCriadas[0].data_vencimento).toBe('2026-12-01');
    expect(parcelasCriadas[0].parcela_atual).toBe(1);
    expect(parcelasCriadas[0].total_parcelas).toBe(3);
    expect(parcelasCriadas[0].parent_id).toBeUndefined();

    // Parcela 2 vinculada com parent_id
    expect(parcelasCriadas[1].valor_total).toBe(200.0);
    expect(parcelasCriadas[1].data_vencimento).toBe('2026-12-15');
    expect(parcelasCriadas[1].parcela_atual).toBe(2);
    expect(parcelasCriadas[1].parent_id).toBe('divida-parcela-1');

    // Parcela 3 vinculada com parent_id
    expect(parcelasCriadas[2].valor_total).toBe(200.0);
    expect(parcelasCriadas[2].data_vencimento).toBe('2026-12-30');
    expect(parcelasCriadas[2].parcela_atual).toBe(3);
    expect(parcelasCriadas[2].parent_id).toBe('divida-parcela-1');
  });

  // ── TESTE 6: PRESERVAR DÍVIDAS QUITADAS (GATE 3) ───────────────────────────
  it('GATE 3: deve PRESERVAR dívida quitada, NÃO alterar status nem valor_pago e NÃO criar obrigação nova', async () => {
    const registry = new ActionExecutorRegistry();
    registerNfeActionHandlers(registry);
    const handler = registry.get('cadastrar_nfe')!;

    const dividaQuitadaExistente = {
      id: 'divida-quitada-xodo-30out',
      descricao: 'Boleto XODO FOODS E DISTRIBUICAO LTDA — Chave: 31261052315807000117550010002356221718206933',
      documento_favorecido: '52.315.807/0001-17',
      credor: 'XODO FOODS E DISTRIBUICAO LTDA',
      valor_total: 658.14,
      valor_pago: 658.14,
      data_vencimento: '2026-10-30',
      status: 'quitada', // CONTA JÁ QUITADA NO BANCO!
    };

    let inseriuDivida = false;
    let atualizouStatusDivida = false;
    let gmailMsgAtualizada: any = null;

    const mockClient: any = {
      from: vi.fn((table: string) => {
        if (table === 'dividas') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [dividaQuitadaExistente] }),
            insert: vi.fn(() => {
              inseriuDivida = true;
              return { select: vi.fn().mockReturnThis() };
            }),
            update: vi.fn(() => {
              atualizouStatusDivida = true;
              return { eq: vi.fn().mockReturnThis() };
            }),
          };
        }
        if (table === 'gmail_mensagens_processadas') {
          return {
            update: vi.fn((fields: any) => {
              gmailMsgAtualizada = fields;
              return {
                eq: vi.fn().mockReturnThis(),
                contains: vi.fn().mockResolvedValue({ data: [], error: null }),
              };
            }),
          };
        }
        if (table === 'notas_fiscais_compra') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'nf-compra-existente' } }),
          };
        }
        if (table === 'nf_itens') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [{ id: 'item-1' }] }),
          };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [] }) };
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

    // Assertivas rígidas do Gate 3:
    expect(inseriuDivida).toBe(false); // NUNCA cria nova obrigação
    expect(atualizouStatusDivida).toBe(false); // NUNCA altera status da dívida
    expect(res.recordId).toBe('divida-quitada-xodo-30out');
    expect(res.data.status).toBe('already_paid');
    expect(res.data.isQuitada).toBe(true);

    // Documento no Gmail deve ser vinculado à dívida quitada
    expect(gmailMsgAtualizada).toEqual({
      divida_id: 'divida-quitada-xodo-30out',
      status: 'processado',
    });
  });

  // ── TESTE 7: DETECÇÃO DE SUSPEITA DE DUPLICIDADE (GATE 2) ─────────────────
  it('GATE 2: deve BLOQUEAR com 409 quando houver suspeita de duplicidade por mesmo valor, credor e data', async () => {
    const registry = new ActionExecutorRegistry();
    registerNfeActionHandlers(registry);
    const handler = registry.get('cadastrar_nfe')!;

    // Existe um boleto já cadastrado com o mesmo credor, mesmo valor e mesma data, mas sem a chave gravada
    const boletoExistente = {
      id: 'boleto-existente-xodo-13nov',
      descricao: 'Boleto XODO FOODS E DISTRIBUICAO LTDA',
      documento_favorecido: '52.315.807/0001-17',
      credor: 'XODO FOODS E DISTRIBUICAO LTDA',
      valor_total: 752.16,
      data_vencimento: '2026-11-13',
      status: 'pendente',
    };

    const mockClient: any = {
      from: vi.fn((table: string) => {
        if (table === 'dividas') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [boletoExistente] }),
          };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [] }) };
      }),
    };

    // NF recebida sem chave na descrição da dívida (ex: nova chave 999999)
    const payloadSuspeito = {
      chave_acesso: '31261152315807000117550010002401189999999999',
      numero_nota: '99999', // Número diferente
      emitente: { cnpj: '52315807000117', razaoSocial: 'XODO FOODS E DISTRIBUICAO LTDA' },
      valores: { valorTotal: 752.16 }, // Mesmo valor
      duplicatas: [{ numero: '001', vencimento: '2026-11-13', valor: 752.16 }], // Mesma data
    };

    await expect(
      handler(payloadSuspeito, { workspaceId: 'ws-rodo', userId: 'user-heitor' } as any, mockClient)
    ).rejects.toThrow('Suspeita de duplicidade financeira detectada: já existe dívida de R$ 752.16 com vencimento em 2026-11-13 do fornecedor "XODO FOODS E DISTRIBUICAO LTDA"');
  });

  // ── TESTE 8: ROLLBACK COMPENSATÓRIO TRANSACIONAL (GATE 5) ─────────────────
  it('GATE 5: deve EXECUTAR ROLLBACK e deletar dívida se a persistência de compra ou itens falhar', async () => {
    const registry = new ActionExecutorRegistry();
    registerNfeActionHandlers(registry);
    const handler = registry.get('cadastrar_nfe')!;

    let dividaDeletadaId: string[] = [];

    const mockClient: any = {
      from: vi.fn((table: string) => {
        if (table === 'dividas') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [] }),
            insert: vi.fn(() => ({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'divida-temporaria-123' }, error: null }),
              }),
            })),
            delete: vi.fn(() => ({
              in: vi.fn((_col: string, ids: string[]) => {
                dividaDeletadaId = ids;
                return Promise.resolve({ error: null });
              }),
            })),
          };
        }
        if (table === 'notas_fiscais_compra') {
          // Simula falha de banco ao gravar a nota fiscal de compra
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            insert: vi.fn(() => ({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Disk I/O failure on fiscal table' } }),
              }),
            })),
          };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [] }) };
      }),
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
    ).rejects.toThrow('Erro ao persistir nota fiscal de compra: Disk I/O failure on fiscal table');

    // Validação do Rollback Compensatório:
    expect(dividaDeletadaId).toEqual(['divida-temporaria-123']);
  });
});
