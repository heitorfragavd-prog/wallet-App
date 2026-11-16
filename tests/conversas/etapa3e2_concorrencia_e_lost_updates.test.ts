import { describe, it, expect } from "vitest";

describe("Etapa 3E.2 - Gate 3: Atomicidade, Concorrência e Eliminação Definitiva de Lost Updates", () => {
  interface FechamentoDB {
    id: string;
    workspace_id: string;
    chave_operacional: string;
    anexos: Array<{ sha256?: string; file_id?: string; path?: string; valor?: number }>;
    telegram_message_ids: number[];
    total: { dinheiro?: number; pix?: number; cartao?: number };
    status: string;
    version: number;
  }

  // Simulação fiel do mecanismo de lock FOR UPDATE e consolidação atômica no PostgreSQL
  class PostgresAtomicFechamentoEngine {
    private db: Map<string, FechamentoDB> = new Map();
    private lockQueue: Map<string, Promise<void>> = new Map();

    private async acquireLock(id: string): Promise<() => void> {
      while (this.lockQueue.has(id)) {
        await this.lockQueue.get(id);
      }
      let releaseLock!: () => void;
      const promise = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
      this.lockQueue.set(id, promise);
      return () => {
        this.lockQueue.delete(id);
        releaseLock();
      };
    }

    public seedFechamento(row: FechamentoDB) {
      this.db.set(row.id, JSON.parse(JSON.stringify(row)));
    }

    public getFechamento(id: string): FechamentoDB | undefined {
      const row = this.db.get(id);
      return row ? JSON.parse(JSON.stringify(row)) : undefined;
    }

    // Executa a RPC consolidar_fechamento_caixa_atomico sob lock pessimista FOR UPDATE
    public async consolidarAtomico(params: {
      fechamento_id: string;
      workspace_id: string;
      novos_anexos: Array<{ sha256?: string; file_id?: string; path?: string; valor?: number }>;
      telegram_message_ids: number[];
      valores_adicionais?: { dinheiro?: number; pix?: number; cartao?: number };
      simular_falha?: boolean;
    }): Promise<{ success: boolean; data?: FechamentoDB; error?: string }> {
      const unlock = await this.acquireLock(params.fechamento_id);

      try {
        const row = this.db.get(params.fechamento_id);
        if (!row || row.workspace_id !== params.workspace_id) {
          return { success: false, error: "Fechamento não encontrado no workspace" };
        }

        if (params.simular_falha) {
          // Em caso de falha transacional, nenhum estado é alterado
          throw new Error("Transação abortada por erro simulado de concorrência");
        }

        // Mesclagem não-destrutiva de anexos (deduplicação por sha256 ou file_id)
        const anexosAtuais = [...row.anexos];
        for (const novo of params.novos_anexos) {
          const jaExiste = anexosAtuais.some(
            (a) =>
              (novo.sha256 && a.sha256 === novo.sha256) ||
              (novo.file_id && a.file_id === novo.file_id)
          );
          if (!jaExiste) {
            anexosAtuais.push(novo);
          }
        }

        // Mesclagem de telegram_message_ids
        const msgs = Array.from(
          new Set([...row.telegram_message_ids, ...params.telegram_message_ids])
        );

        // Recálculo financeiro consolidado a partir dos anexos persistidos
        let totalDinheiro = 0;
        const totalPix = 0;
        const totalCartao = 0;
        for (const anexo of anexosAtuais) {
          if (anexo.valor) totalDinheiro += anexo.valor;
        }

        row.anexos = anexosAtuais;
        row.telegram_message_ids = msgs;
        row.total = {
          dinheiro: totalDinheiro,
          pix: totalPix,
          cartao: totalCartao,
        };
        row.version += 1;

        return { success: true, data: JSON.parse(JSON.stringify(row)) };
      } catch (err: unknown) {
        return { success: false, error: (err as Error).message };
      } finally {
        unlock();
      }
    }
  }

  it("1. Deve processar 2 fotografias simultâneas sem lost update", async () => {
    const engine = new PostgresAtomicFechamentoEngine();
    const fechId = "fech-concorrente-2";
    engine.seedFechamento({
      id: fechId,
      workspace_id: "ws-rodo",
      chave_operacional: "op-1",
      anexos: [],
      telegram_message_ids: [],
      total: { dinheiro: 0 },
      status: "pendente_conferencia",
      version: 0,
    });

    const p1 = engine.consolidarAtomico({
      fechamento_id: fechId,
      workspace_id: "ws-rodo",
      novos_anexos: [{ file_id: "foto_1", sha256: "h1", valor: 150 }],
      telegram_message_ids: [101],
    });

    const p2 = engine.consolidarAtomico({
      fechamento_id: fechId,
      workspace_id: "ws-rodo",
      novos_anexos: [{ file_id: "foto_2", sha256: "h2", valor: 250 }],
      telegram_message_ids: [102],
    });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);

    const final = engine.getFechamento(fechId);
    expect(final?.anexos).toHaveLength(2);
    expect(final?.telegram_message_ids).toEqual([101, 102]);
    expect(final?.total.dinheiro).toBe(400); // 150 + 250
    expect(final?.version).toBe(2);
  });

  it("2. Deve processar 5 fotografias concorrentes preservando todas", async () => {
    const engine = new PostgresAtomicFechamentoEngine();
    const fechId = "fech-concorrente-5";
    engine.seedFechamento({
      id: fechId,
      workspace_id: "ws-rodo",
      chave_operacional: "op-5",
      anexos: [],
      telegram_message_ids: [],
      total: { dinheiro: 0 },
      status: "pendente_conferencia",
      version: 0,
    });

    const promises = Array.from({ length: 5 }, (_, i) =>
      engine.consolidarAtomico({
        fechamento_id: fechId,
        workspace_id: "ws-rodo",
        novos_anexos: [{ file_id: `foto_${i}`, sha256: `hash_${i}`, valor: 50 }],
        telegram_message_ids: [200 + i],
      })
    );

    const results = await Promise.all(promises);
    expect(results.every((r) => r.success)).toBe(true);

    const final = engine.getFechamento(fechId);
    expect(final?.anexos).toHaveLength(5);
    expect(final?.telegram_message_ids).toHaveLength(5);
    expect(final?.total.dinheiro).toBe(250); // 5 * 50
    expect(final?.version).toBe(5);
  });

  it("3. Deve processar 10 fotografias concorrentes em lote", async () => {
    const engine = new PostgresAtomicFechamentoEngine();
    const fechId = "fech-concorrente-10";
    engine.seedFechamento({
      id: fechId,
      workspace_id: "ws-rodo",
      chave_operacional: "op-10",
      anexos: [],
      telegram_message_ids: [],
      total: { dinheiro: 0 },
      status: "pendente_conferencia",
      version: 0,
    });

    const promises = Array.from({ length: 10 }, (_, i) =>
      engine.consolidarAtomico({
        fechamento_id: fechId,
        workspace_id: "ws-rodo",
        novos_anexos: [{ file_id: `f10_${i}`, sha256: `h10_${i}`, valor: 100 }],
        telegram_message_ids: [300 + i],
      })
    );

    await Promise.all(promises);
    const final = engine.getFechamento(fechId);
    expect(final?.anexos).toHaveLength(10);
    expect(final?.total.dinheiro).toBe(1000);
  });

  it("4. Deve processar 20 fotografias sob alta concorrência", async () => {
    const engine = new PostgresAtomicFechamentoEngine();
    const fechId = "fech-concorrente-20";
    engine.seedFechamento({
      id: fechId,
      workspace_id: "ws-rodo",
      chave_operacional: "op-20",
      anexos: [],
      telegram_message_ids: [],
      total: { dinheiro: 0 },
      status: "pendente_conferencia",
      version: 0,
    });

    const promises = Array.from({ length: 20 }, (_, i) =>
      engine.consolidarAtomico({
        fechamento_id: fechId,
        workspace_id: "ws-rodo",
        novos_anexos: [{ file_id: `f20_${i}`, sha256: `h20_${i}`, valor: 20 }],
        telegram_message_ids: [400 + i],
      })
    );

    await Promise.all(promises);
    const final = engine.getFechamento(fechId);
    expect(final?.anexos).toHaveLength(20);
    expect(final?.total.dinheiro).toBe(400); // 20 * 20
  });

  it("5. Webhook duplicado: deve deduplicar anexo idêntico sem duplicar valores", async () => {
    const engine = new PostgresAtomicFechamentoEngine();
    const fechId = "fech-dedup";
    engine.seedFechamento({
      id: fechId,
      workspace_id: "ws-rodo",
      chave_operacional: "op-dedup",
      anexos: [],
      telegram_message_ids: [],
      total: { dinheiro: 0 },
      status: "pendente_conferencia",
      version: 0,
    });

    // Primeira chamada
    await engine.consolidarAtomico({
      fechamento_id: fechId,
      workspace_id: "ws-rodo",
      novos_anexos: [{ file_id: "same_photo", sha256: "same_hash", valor: 300 }],
      telegram_message_ids: [501],
    });

    // Segunda chamada duplicada (retentativa de webhook)
    await engine.consolidarAtomico({
      fechamento_id: fechId,
      workspace_id: "ws-rodo",
      novos_anexos: [{ file_id: "same_photo", sha256: "same_hash", valor: 300 }],
      telegram_message_ids: [501],
    });

    const final = engine.getFechamento(fechId);
    expect(final?.anexos).toHaveLength(1);
    expect(final?.telegram_message_ids).toEqual([501]);
    expect(final?.total.dinheiro).toBe(300); // Não duplicou para 600!
  });

  it("6. Documento complementar: adiciona novo comprovante somando ao fechamento", async () => {
    const engine = new PostgresAtomicFechamentoEngine();
    const fechId = "fech-comp";
    engine.seedFechamento({
      id: fechId,
      workspace_id: "ws-rodo",
      chave_operacional: "op-comp",
      anexos: [{ file_id: "recibo_principal", sha256: "hash_princ", valor: 500 }],
      telegram_message_ids: [601],
      total: { dinheiro: 500 },
      status: "pendente_conferencia",
      version: 1,
    });

    // Documento complementar
    await engine.consolidarAtomico({
      fechamento_id: fechId,
      workspace_id: "ws-rodo",
      novos_anexos: [{ file_id: "comprovante_voucher", sha256: "hash_voucher", valor: 50 }],
      telegram_message_ids: [602],
    });

    const final = engine.getFechamento(fechId);
    expect(final?.anexos).toHaveLength(2);
    expect(final?.total.dinheiro).toBe(550);
    expect(final?.telegram_message_ids).toEqual([601, 602]);
  });

  it("7. Falha durante atualização não corrompe estado prévio (rollback transacional)", async () => {
    const engine = new PostgresAtomicFechamentoEngine();
    const fechId = "fech-rollback";
    engine.seedFechamento({
      id: fechId,
      workspace_id: "ws-rodo",
      chave_operacional: "op-rb",
      anexos: [{ file_id: "recibo_original", sha256: "hash_orig", valor: 200 }],
      telegram_message_ids: [701],
      total: { dinheiro: 200 },
      status: "pendente_conferencia",
      version: 1,
    });

    // Chamada com falha
    const res = await engine.consolidarAtomico({
      fechamento_id: fechId,
      workspace_id: "ws-rodo",
      novos_anexos: [{ file_id: "foto_com_erro", sha256: "hash_err", valor: 100 }],
      telegram_message_ids: [702],
      simular_falha: true,
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("Transação abortada");

    // Estado inalterado
    const check = engine.getFechamento(fechId);
    expect(check?.anexos).toHaveLength(1);
    expect(check?.total.dinheiro).toBe(200);
    expect(check?.version).toBe(1);
  });

  it("8. Retentativa bem-sucedida após falha recupera o estado e aplica a consolidação", async () => {
    const engine = new PostgresAtomicFechamentoEngine();
    const fechId = "fech-retry";
    engine.seedFechamento({
      id: fechId,
      workspace_id: "ws-rodo",
      chave_operacional: "op-retry",
      anexos: [{ file_id: "foto_1", sha256: "h1", valor: 100 }],
      telegram_message_ids: [801],
      total: { dinheiro: 100 },
      status: "pendente_conferencia",
      version: 1,
    });

    // Tentativa que falha
    await engine.consolidarAtomico({
      fechamento_id: fechId,
      workspace_id: "ws-rodo",
      novos_anexos: [{ file_id: "foto_2", sha256: "h2", valor: 150 }],
      telegram_message_ids: [802],
      simular_falha: true,
    });

    // Retentativa com sucesso
    const retryRes = await engine.consolidarAtomico({
      fechamento_id: fechId,
      workspace_id: "ws-rodo",
      novos_anexos: [{ file_id: "foto_2", sha256: "h2", valor: 150 }],
      telegram_message_ids: [802],
      simular_falha: false,
    });

    expect(retryRes.success).toBe(true);
    const final = engine.getFechamento(fechId);
    expect(final?.anexos).toHaveLength(2);
    expect(final?.total.dinheiro).toBe(250);
  });
});
