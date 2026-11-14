import { describe, it, expect, vi, beforeEach } from "vitest";
import { consolidateFechamentoValues } from "../../supabase/functions/_shared/ai/folguista-fechamento-engine";

describe("Etapa 3E-B — Concorrência e Recebimento de Várias Fotografias (Gate 5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve simular o lock pessimista da RPC unindo anexos sem perda quando 5 webhooks chegam em paralelo", async () => {
    // Simulação do comportamento da RPC registrar_anexo_fechamento_atomico com lock atômico
    interface FechamentoRow {
      id: string;
      workspace_id: string;
      chave_operacional: string;
      anexos: Array<Record<string, unknown>>;
      telegram_message_ids: number[];
    }

    let dbState: FechamentoRow | null = null;
    let lockQueue = Promise.resolve();

    // Mock da RPC que simula a transação SERIALIZABLE / FOR UPDATE no PostgreSQL
    const mockRpcRegistrarAnexo = async (params: {
      workspaceId: string;
      chaveOperacional: string;
      anexo: Record<string, unknown>;
      messageId: number;
    }) => {
      // Enfileira transações atômicas com lock na linha
      const release = lockQueue;
      let resolveLock: () => void;
      lockQueue = new Promise((resolve) => {
        resolveLock = resolve;
      });

      await release;
      try {
        if (!dbState) {
          dbState = {
            id: "fech-atomic-uuid-1",
            workspace_id: params.workspaceId,
            chave_operacional: params.chaveOperacional,
            anexos: [params.anexo],
            telegram_message_ids: [params.messageId],
          };
        } else {
          // Verifica duplicação de sha256
          const exists = dbState.anexos.some(
            (a) => a.sha256 === params.anexo.sha256 || a.file_id === params.anexo.file_id
          );
          if (!exists) {
            dbState.anexos.push(params.anexo);
          }
          if (!dbState.telegram_message_ids.includes(params.messageId)) {
            dbState.telegram_message_ids.push(params.messageId);
          }
        }
        return {
          id: dbState.id,
          anexos: [...dbState.anexos],
          telegram_message_ids: [...dbState.telegram_message_ids],
        };
      } finally {
        resolveLock!();
      }
    };

    // 5 fotos enviadas ao mesmo tempo via Telegram num mesmo álbum (media_group_id)
    const fotosWebhook = Array.from({ length: 5 }, (_, i) => ({
      id: `anexo-${i + 1}`,
      file_id: `tg_file_${i + 1}`,
      sha256: `sha256_hash_foto_${i + 1}`,
      tipo_documento: i === 0 ? "relatorio_consolidado" : "comprovante_voucher",
      valor_extraido: {
        dinheiro: i === 0 ? 500 : 0,
        debito: 0,
        credito: 0,
        pix: 0,
        voucher: i > 0 ? 50 : 0,
        outros: 0,
      },
    }));

    // Disparo concorrente simultâneo com Promise.all
    const resultados = await Promise.all(
      fotosWebhook.map((anexo, idx) =>
        mockRpcRegistrarAnexo({
          workspaceId: "ws-1",
          chaveOperacional: "ws-1_2026-11-21_colab-1_noite",
          anexo,
          messageId: 1000 + idx,
        })
      )
    );

    expect(resultados.length).toBe(5);
    expect(dbState).not.toBeNull();
    // Nenhum anexo foi perdido (lost update evitado)
    expect(dbState!.anexos.length).toBe(5);
    expect(dbState!.telegram_message_ids.length).toBe(5);

    // Validação da consolidação dos valores recebidos concorrentemente
    const consolidado = consolidateFechamentoValues(dbState!.anexos);
    expect(consolidado.valores.dinheiro).toBe(500);
    // 4 filipetas de voucher de R$ 50 somadas = R$ 200
    expect(consolidado.valores.voucher).toBe(200);
  });

  it("deve ignorar anexos repetidos quando o mesmo arquivo for submetido em requisições paralelas", async () => {
    const anexosComDuplicata = [
      {
        id: "a1",
        file_id: "file_rep_1",
        sha256: "hash_repetido_abc",
        tipo_documento: "comprovante_individual",
        valor_extraido: { dinheiro: 0, debito: 100, credito: 0, pix: 0, voucher: 0, outros: 0 },
      },
      {
        id: "a2", // ID diferente gerado pelo webhook mas mesmo sha256
        file_id: "file_rep_1",
        sha256: "hash_repetido_abc",
        tipo_documento: "comprovante_individual",
        valor_extraido: { dinheiro: 0, debito: 100, credito: 0, pix: 0, voucher: 0, outros: 0 },
      },
      {
        id: "a3",
        file_id: "file_unico_2",
        sha256: "hash_unico_xyz",
        tipo_documento: "comprovante_individual",
        valor_extraido: { dinheiro: 0, debito: 50, credito: 0, pix: 0, voucher: 0, outros: 0 },
      },
    ];

    const consolidado = consolidateFechamentoValues(anexosComDuplicata);
    // Não soma duas vezes o comprovante repetido de R$ 100: 100 + 50 = 150
    expect(consolidado.valores.debito).toBe(150);
    expect(consolidado.anexosProcessados.filter((a) => a.is_duplicata).length).toBe(1);
    expect(consolidado.anexosProcessados.filter((a) => !a.is_duplicata).length).toBe(2);
  });

  it("deve suportar até 10 fotografias simultâneas sem estourar o limites de anexos", () => {
    const dezFotos = Array.from({ length: 10 }, (_, i) => ({
      id: `anx-${i}`,
      file_id: `f_${i}`,
      sha256: `hash_${i}`,
      tipo_documento: "comprovante_individual",
      valor_extraido: { dinheiro: 0, debito: 10, credito: 0, pix: 0, voucher: 0, outros: 0 },
    }));

    const consolidado = consolidateFechamentoValues(dezFotos);
    expect(consolidado.valores.debito).toBe(100);
    expect(consolidado.anexosProcessados.length).toBe(10);
  });
});
