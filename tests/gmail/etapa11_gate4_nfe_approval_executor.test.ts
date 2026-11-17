import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ActionExecutorRegistry,
  registerNfeActionHandlers,
  createDefaultActionExecutorRegistry,
} from '../../supabase/functions/_shared/ai/action-executor-registry';

describe('👑 WALLET CEO 3.0 — Gate 1 & 4: Executor Financeiro de Aprovação de NF-e', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve registrar o handler "cadastrar_nfe" no registro padrão canônico', () => {
    const registry = createDefaultActionExecutorRegistry();
    expect(registry.has('cadastrar_nfe')).toBe(true);
  });

  it('deve rejeitar se workspaceId ou userId não estiverem no contexto', async () => {
    const registry = new ActionExecutorRegistry();
    registerNfeActionHandlers(registry);
    const handler = registry.get('cadastrar_nfe')!;

    const mockClient = {} as any;
    await expect(
      handler({}, { workspaceId: '', userId: '' } as any, mockClient)
    ).rejects.toThrow('workspaceId e userId são obrigatórios no contexto de execução.');
  });

  it('deve rejeitar se o valor total da NF-e for menor ou igual a zero', async () => {
    const registry = new ActionExecutorRegistry();
    registerNfeActionHandlers(registry);
    const handler = registry.get('cadastrar_nfe')!;

    const mockClient = {} as any;
    await expect(
      handler({ valor_total: 0 }, { workspaceId: 'ws-123', userId: 'user-456' } as any, mockClient)
    ).rejects.toThrow('Valor total da NF-e deve ser maior que zero.');
  });

  it('deve cadastrar uma nova dívida com status pendente e valor_pago = 0', async () => {
    const registry = new ActionExecutorRegistry();
    registerNfeActionHandlers(registry);
    const handler = registry.get('cadastrar_nfe')!;

    let dividaInserida: any = null;
    let nfeCompraInserida: any = null;
    let itensInseridos: any[] = [];
    let gmailMsgAtualizada: any = null;

    const mockClient: any = {
      from: vi.fn((table: string) => {
        if (table === 'dividas') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [] }), // Nenhuma dívida anterior (sem duplicata)
            insert: vi.fn((rows: any[]) => {
              dividaInserida = rows[0];
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'divida-uuid-789' },
                    error: null,
                  }),
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
            insert: vi.fn((rows: any[]) => {
              nfeCompraInserida = rows[0];
              return {
                select: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'nf-compra-uuid-101' },
                  }),
                }),
              };
            }),
          };
        }
        if (table === 'nf_itens') {
          return {
            insert: vi.fn((rows: any[]) => {
              itensInseridos = rows;
              return Promise.resolve({ data: rows, error: null });
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
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [] }),
        };
      }),
    };

    const payload = {
      chave_acesso: '31261117467515000107550020030898491343004765',
      numero_nota: '3089849',
      emitente: {
        cnpj: '17.467.515/0001-07',
        razaoSocial: 'CAFE TRES CORACOES SA',
        nomeFantasia: 'MATRIZ CAFE 3CORACOES',
      },
      valores: {
        valorTotal: 528.76,
        valorProdutos: 543.0,
      },
      duplicatas: [
        {
          numero: '001',
          vencimento: '2026-12-04',
          valor: 528.76,
        },
      ],
      itens: [
        {
          codigoProduto: '000000000012034010',
          descricao: 'CAFE CAPPUCCINO 3 CORACOES CLASSIC SACHE 50X20G',
          quantidade: 1,
          valorUnitario: 98.5,
          valorTotal: 98.5,
          ncm: '21011200',
        },
        {
          codigoProduto: '000000000012031007',
          descricao: 'CAFE TM 3C EF INT SPACK 10X500G',
          quantidade: 2,
          valorUnitario: 222.25,
          valorTotal: 444.5,
          ncm: '09012100',
        },
      ],
    };

    const res = await handler(
      payload,
      { workspaceId: 'ws-rodo-point', userId: 'user-heitor' } as any,
      mockClient,
    );

    expect(res.recordId).toBe('divida-uuid-789');
    expect(res.data).toEqual({ dividaId: 'divida-uuid-789', jaExistia: false });

    // Validação da dívida criada (deve ser PENDENTE, com valor total correto e valor pago = 0)
    expect(dividaInserida).toBeTruthy();
    expect(dividaInserida.workspace_id).toBe('ws-rodo-point');
    expect(dividaInserida.user_id).toBe('user-heitor');
    expect(dividaInserida.status).toBe('pendente');
    expect(dividaInserida.valor_total).toBe(528.76);
    expect(dividaInserida.valor_pago).toBe(0);
    expect(dividaInserida.valor_restante).toBe(528.76);
    expect(dividaInserida.data_vencimento).toBe('2026-12-04');
    expect(dividaInserida.credor).toBe('CAFE TRES CORACOES SA');
    expect(dividaInserida.documento_favorecido).toBe('17467515000107');

    // Validação de notas_fiscais_compra e itens
    expect(nfeCompraInserida).toBeTruthy();
    expect(nfeCompraInserida.chave_acesso).toBe('31261117467515000107550020030898491343004765');
    expect(itensInseridos.length).toBe(2);
    expect(itensInseridos[0].descricao).toBe('CAFE CAPPUCCINO 3 CORACOES CLASSIC SACHE 50X20G');

    // Validação do vínculo com gmail_mensagens_processadas
    expect(gmailMsgAtualizada).toEqual({
      divida_id: 'divida-uuid-789',
      status: 'processado',
    });
  });

  it('deve ser idempotente e NÃO duplicar dívida se a mesma NF-e já existir', async () => {
    const registry = new ActionExecutorRegistry();
    registerNfeActionHandlers(registry);
    const handler = registry.get('cadastrar_nfe')!;

    const dividaExistente = {
      id: 'divida-ja-cadastrada-999',
      descricao: 'NF-e nº 3089849 — CAFE TRES CORACOES SA (Chave: 31261117467515000107550020030898491343004765)',
      documento_favorecido: '17467515000107',
      valor_total: 528.76,
      data_vencimento: '2026-12-04',
      status: 'pendente',
    };

    let inseriuDivida = false;
    const mockClient: any = {
      from: vi.fn((table: string) => {
        if (table === 'dividas') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [dividaExistente] }),
            insert: vi.fn(() => {
              inseriuDivida = true;
              return { select: vi.fn().mockReturnThis() };
            }),
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
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'nf-existente' } }),
        };
      }),
    };

    const payload = {
      chave_acesso: '31261117467515000107550020030898491343004765',
      numero_nota: '3089849',
      emitente: {
        cnpj: '17467515000107',
        razaoSocial: 'CAFE TRES CORACOES SA',
      },
      valores: { valorTotal: 528.76 },
    };

    const res = await handler(
      payload,
      { workspaceId: 'ws-rodo-point', userId: 'user-heitor' } as any,
      mockClient,
    );

    expect(inseriuDivida).toBe(false);
    expect(res.recordId).toBe('divida-ja-cadastrada-999');
    expect(res.data).toEqual({ dividaId: 'divida-ja-cadastrada-999', jaExistia: true });
  });
});
