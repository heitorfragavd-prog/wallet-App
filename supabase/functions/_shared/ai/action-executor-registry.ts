import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import type { AiExecutionContext } from "./auth.ts";
import { ActionGatewayError } from "./action-gateway.ts";
import {
  cleanDigits,
  validateLinhaDigitavel,
  validateCodigoBarras,
} from "./boleto-validator.ts";

export type ActionExecutionHandler = (
  payload: Record<string, unknown>,
  context: AiExecutionContext,
  client: SupabaseClient,
) => Promise<{ recordId?: string; data?: unknown }>;

export class ActionExecutorRegistry {
  private handlers = new Map<string, ActionExecutionHandler>();

  register(actionType: string, handler: ActionExecutionHandler): void {
    this.handlers.set(actionType, handler);
  }

  has(actionType: string): boolean {
    return this.handlers.has(actionType);
  }

  get(actionType: string): ActionExecutionHandler | undefined {
    return this.handlers.get(actionType);
  }
}

/**
 * Registra manipuladores concretos para ações de metas.
 * 
 * NOTA ARQUITETURAL (CHECKPOINT 9.4A.1):
 * A tabela 'public.metas' possui apenas 'user_id' e NÃO possui coluna 'workspace_id'.
 * Portanto, o domínio de metas é puramente user-scoped no schema atual.
 * Se ativado, o executor opera no escopo da conta pessoal do usuário.
 */
export function registerMetaActionHandlers(registry: ActionExecutorRegistry): void {
  // ── LOW RISK: cadastrar_meta ──────────────────────────────────────────────
  registry.register("cadastrar_meta", async (payload, context, client) => {
    const titulo = String(payload.nome || payload.titulo || "").trim();
    const valorAlvo = Number(payload.valor_alvo);
    const valorAtual = Number(payload.valor_atual ?? 0);
    const dataLimite = String(payload.data_limite || "2026-12-31").trim();
    const tipo = String(payload.tipo || "economia").toLowerCase();
    const descricao = payload.descricao ? String(payload.descricao).trim() : null;

    if (!titulo || !Number.isFinite(valorAlvo) || valorAlvo <= 0) {
      throw new ActionGatewayError(
        "WALLET_AI_ACTION_INVALID",
        400,
        "Dados inválidos para cadastrar_meta: título e valor_alvo positivo são obrigatórios.",
      );
    }

    const { data, error } = await client
      .from("metas")
      .insert([
        {
          titulo,
          valor_alvo: valorAlvo,
          valor_atual: Number.isFinite(valorAtual) && valorAtual >= 0 ? valorAtual : 0,
          data_limite: dataLimite,
          tipo: ["economia", "receita", "despesa", "investimento"].includes(tipo) ? tipo : "economia",
          status: "ativa",
          descricao,
          user_id: context.userId,
        },
      ])
      .select("id")
      .single();

    if (error || !data) {
      throw new ActionGatewayError(
        "WALLET_AI_ACTION_EXECUTION_ERROR",
        500,
        `Erro ao persistir meta no banco de dados: ${error?.message ?? "Falha na inserção"}`,
      );
    }

    return { recordId: data.id, data };
  });

  // ── LOW RISK: atualizar_meta ──────────────────────────────────────────────
  registry.register("atualizar_meta", async (payload, context, client) => {
    const metaId = String(payload.meta_id || "").trim();
    if (!metaId) {
      throw new ActionGatewayError(
        "WALLET_AI_ACTION_INVALID",
        400,
        "meta_id obrigatório para atualização de meta.",
      );
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (payload.valor_atual !== undefined) {
      const vAtual = Number(payload.valor_atual);
      if (Number.isFinite(vAtual) && vAtual >= 0) {
        updates.valor_atual = vAtual;
      }
    }

    if (payload.status !== undefined) {
      const s = String(payload.status).toLowerCase();
      if (["ativa", "concluida", "pausada", "vencida"].includes(s)) {
        updates.status = s;
      }
    }

    if (payload.nome || payload.titulo) {
      updates.titulo = String(payload.nome || payload.titulo).trim();
    }

    const { data, error } = await client
      .from("metas")
      .update(updates)
      .eq("id", metaId)
      .eq("user_id", context.userId)
      .select("id")
      .single();

    if (error || !data) {
      throw new ActionGatewayError(
        "WALLET_AI_ACTION_EXECUTION_ERROR",
        500,
        `Erro ao atualizar meta: ${error?.message ?? "Registro não encontrado ou não autorizado"}`,
      );
    }

    return { recordId: data.id, data };
  });
}

/**
 * Registra o manipulador de persistência para boletos validados após confirmação humana.
 * 
 * REGRAS DE SEGURANÇA E NEGÓCIO:
 * - workspace_id e user_id obtidos estritamente do contexto de execução autenticado server-side.
 * - Boleto é cadastrado estritamente com status: 'pendente' e valor_pago: 0 (NÃO pago, NÃO liquidado).
 * - Nenhuma despesa liquidada é gerada automaticamente.
 * - Validações numéricas e de formato obrigatórias.
 */
export function registerBoletoActionHandlers(registry: ActionExecutorRegistry): void {
  registry.register("cadastrar_divida_boleto", async (payload, context, client) => {
    if (!context.workspaceId || !context.userId) {
      throw new ActionGatewayError(
        "WALLET_AI_ACTION_INVALID",
        400,
        "workspaceId e userId são obrigatórios no contexto de execução.",
      );
    }

    const valor = Number(payload.valor_total ?? payload.valor);
    if (!Number.isFinite(valor) || valor <= 0) {
      throw new ActionGatewayError(
        "WALLET_AI_ACTION_INVALID",
        400,
        "Valor do boleto deve ser maior que zero.",
      );
    }

    const dataVencimento = String(payload.data_vencimento || "").trim();
    if (!dataVencimento) {
      throw new ActionGatewayError(
        "WALLET_AI_ACTION_INVALID",
        400,
        "Data de vencimento é obrigatória para cadastro de boleto.",
      );
    }

    const beneficiario = String(payload.beneficiario || payload.credor || "Beneficiário").trim();
    const descricao = String(payload.descricao || `Boleto ${beneficiario}`).trim();

    let finalLinha = payload.linha_digitavel ? String(payload.linha_digitavel).trim() : null;
    let finalCodigoBarras = payload.codigo_barras ? String(payload.codigo_barras).trim() : null;

    if (finalLinha) {
      const validacaoLinha = validateLinhaDigitavel(finalLinha);
      if (validacaoLinha.valido && validacaoLinha.codigoBarrasDerivado) {
        const cbDerivado = validacaoLinha.codigoBarrasDerivado;
        if (!finalCodigoBarras || cleanDigits(finalCodigoBarras) !== cbDerivado) {
          const cbAtualClean = cleanDigits(finalCodigoBarras);
          const cbAtualValidacao = cbAtualClean ? validateCodigoBarras(cbAtualClean) : null;
          if (!cbAtualValidacao || !cbAtualValidacao.valido) {
            // OCR bruto com 48 dígitos, ruído ou checksum incorreto -> adotar canônico derivado de 44 dígitos
            finalCodigoBarras = cbDerivado;
          } else if (cbAtualClean !== cbDerivado) {
            // Código de barras fornecido é válido por si só mas contradiz a linha digitável válida
            throw new ActionGatewayError(
              "WALLET_AI_ACTION_INVALID",
              400,
              "Inconsistência irreconciliável: código de barras e linha digitável válidos apontam para documentos diferentes.",
            );
          }
        } else {
          finalCodigoBarras = cbDerivado;
        }
        finalLinha = finalLinha || validacaoLinha.linhaFormatada;
      } else {
        // Linha digitável informada é inválida
        if (finalCodigoBarras) {
          const cbClean = cleanDigits(finalCodigoBarras);
          const validacaoCb = validateCodigoBarras(cbClean);
          if (!validacaoCb.valido) {
            throw new ActionGatewayError(
              "WALLET_AI_ACTION_INVALID",
              400,
              `Linha digitável e código de barras inválidos: ${validacaoLinha.erros.join("; ")} | ${validacaoCb.erros.join("; ")}`,
            );
          }
          finalCodigoBarras = cbClean;
          finalLinha = null;
        } else {
          throw new ActionGatewayError(
            "WALLET_AI_ACTION_INVALID",
            400,
            `Linha digitável do boleto inválida: ${validacaoLinha.erros.join("; ")}`,
          );
        }
      }
    } else if (finalCodigoBarras) {
      const cbClean = cleanDigits(finalCodigoBarras);
      const validacaoCb = validateCodigoBarras(cbClean);
      if (!validacaoCb.valido) {
        throw new ActionGatewayError(
          "WALLET_AI_ACTION_INVALID",
          400,
          `Código de barras inválido: ${validacaoCb.erros.join(", ")}`,
        );
      }
      finalCodigoBarras = cbClean;
    }

    const insertRow = {
      user_id: context.userId,
      workspace_id: context.workspaceId,
      descricao,
      credor: beneficiario,
      documento_favorecido: payload.cnpj_cpf_beneficiario ? String(payload.cnpj_cpf_beneficiario).trim() : null,
      valor_total: valor,
      valor_pago: 0,
      valor_restante: valor,
      data_vencimento: dataVencimento,
      status: "pendente",
      metodo_pagamento_esperado: "boleto",
      linha_digitavel: finalLinha,
      codigo_barras: finalCodigoBarras,
      parcelas: 1,
      parcelas_pagas: 0,
      parcela_atual: 1,
      total_parcelas: 1,
    };

    const { data, error } = await client
      .from("dividas")
      .insert([insertRow])
      .select("id")
      .single();

    if (error || !data) {
      throw new ActionGatewayError(
        "WALLET_AI_ACTION_EXECUTION_ERROR",
        500,
        `Erro ao persistir dívida de boleto no banco: ${error?.message ?? "Falha na inserção"}`,
      );
    }

    return { recordId: data.id, data };
  });
}

/**
 * Registra o manipulador de persistência para NF-e aprovada pelo usuário.
 * 
 * REGRAS DE SEGURANÇA E NEGÓCIO (GATES 1 A 5 - WALLET CEO 3.0):
 * - GATE 1 & 5: workspace_id e user_id estritamente validados no contexto server-side autenticado.
 * - GATE 2: Deduplicação determinística rigorosa (Chave de Acesso, NF + CNPJ, Código de Barras).
 *   Suspeitas baseadas apenas em valor/data/fornecedor lançam WALLET_AI_ACTION_SUSPECTED_DUPLICATE
 *   exigindo confirmação humana explícita para evitar duplicidades silenciosas.
 * - GATE 3: Preservação de contas quitadas: se corresponder a dívida já paga, vincula documentalmente
 *   sem criar obrigação nova e SEM alterar status nem valor_pago.
 * - GATE 4: NÃO inventa vencimentos fictícios (proibido padrão 30 dias). Rejeita com 400 se não
 *   houver data de vencimento comprovada. Suporta múltiplas duplicatas gerando fatiamento real de caixa.
 * - GATE 5: Rollback compensatório transacional: se a gravação de notas_fiscais_compra ou nf_itens falhar,
 *   a criação de dívidas é revertida atomicamente, impedindo estados parciais ou corrupção de dados.
 */
export function registerNfeActionHandlers(registry: ActionExecutorRegistry): void {
  registry.register("cadastrar_nfe", async (payload, context, client) => {
    if (!context.workspaceId || !context.userId) {
      throw new ActionGatewayError(
        "WALLET_AI_ACTION_INVALID",
        400,
        "workspaceId e userId são obrigatórios no contexto de execução.",
      );
    }

    const valorTotal = Number(
      (payload.valores as Record<string, unknown> | undefined)?.valorTotal ??
      payload.valor_total ??
      payload.valor ??
      0,
    );

    if (!Number.isFinite(valorTotal) || valorTotal <= 0) {
      throw new ActionGatewayError(
        "WALLET_AI_ACTION_INVALID",
        400,
        "Valor total da NF-e deve ser maior que zero.",
      );
    }

    const chaveAcesso = String(payload.chave_acesso || "").trim();
    const numeroNota = String(payload.numero_nota || "").trim();
    const emitente = (payload.emitente || {}) as Record<string, unknown>;
    const cnpj = String(emitente.cnpj || payload.cnpj || "").replace(/\D/g, "");
    const razaoSocial = String(emitente.razaoSocial || emitente.nomeFantasia || payload.emitente_nome || "Fornecedor").trim();

    // ── GATE 4: NÃO INVENTAR VENCIMENTOS ──────────────────────────────────────
    const duplicatas = Array.isArray(payload.duplicatas) ? payload.duplicatas : [];
    let dataVencimentoPrimeira = "";
    if (duplicatas.length > 0 && (duplicatas[0] as Record<string, unknown>).vencimento) {
      dataVencimentoPrimeira = String((duplicatas[0] as Record<string, unknown>).vencimento).trim();
    } else if (payload.data_vencimento) {
      dataVencimentoPrimeira = String(payload.data_vencimento).trim();
    }

    if (!dataVencimentoPrimeira) {
      throw new ActionGatewayError(
        "WALLET_AI_ACTION_INVALID",
        400,
        "Data de vencimento não comprovada no documento fiscal. Conforme política de segurança financeira (Gate 4), é proibido atribuir vencimentos fictícios. Requer conferência humana da data de vencimento.",
      );
    }

    // Se houver múltiplas duplicatas, validar que todas possuem vencimento e valor válido
    if (duplicatas.length > 1) {
      for (let i = 0; i < duplicatas.length; i++) {
        const dup = duplicatas[i] as Record<string, unknown>;
        const vDup = Number(dup.valor);
        const dtDup = String(dup.vencimento || "").trim();
        if (!dtDup || !Number.isFinite(vDup) || vDup <= 0) {
          throw new ActionGatewayError(
            "WALLET_AI_ACTION_INVALID",
            400,
            `Duplicata ${i + 1} da NF-e inválida: vencimento comprovado e valor positivo são obrigatórios para cada parcela.`,
          );
        }
      }
    }

    // ── GATE 2 & 3: DEDUPLICAÇÃO DETERMINÍSTICA E PRESERVAÇÃO DE QUITADAS ─────
    const { data: dividasExistentes, error: errQueryDividas } = await client
      .from("dividas")
      .select("id, descricao, documento_favorecido, credor, valor_total, valor_pago, data_vencimento, status, linha_digitavel, codigo_barras")
      .eq("workspace_id", context.workspaceId);

    if (errQueryDividas) {
      throw new ActionGatewayError(
        "WALLET_AI_ACTION_EXECUTION_ERROR",
        500,
        `Erro ao consultar dívidas do workspace: ${errQueryDividas.message}`,
      );
    }

    // Match Determinístico 1: Chave de Acesso (44 dígitos)
    let dividaDeterminada = (dividasExistentes || []).find((d: any) => {
      return chaveAcesso && d.descricao && d.descricao.includes(chaveAcesso);
    });

    // Match Determinístico 2: Número da NF-e + CNPJ do Fornecedor
    if (!dividaDeterminada && numeroNota && cnpj) {
      dividaDeterminada = (dividasExistentes || []).find((d: any) => {
        const matchNota = d.descricao && (
          d.descricao.includes(numeroNota) ||
          d.descricao.includes(`NF ${numeroNota}`) ||
          d.descricao.includes(`NF-e ${numeroNota}`)
        );
        const matchCnpj = d.documento_favorecido && d.documento_favorecido.replace(/\D/g, "") === cnpj;
        return matchNota && matchCnpj;
      });
    }

    // Match Determinístico 3: Código de Barras / Linha Digitável (se presente nas duplicatas)
    if (!dividaDeterminada && payload.codigo_barras) {
      const cb = String(payload.codigo_barras).replace(/\D/g, "");
      if (cb) {
        dividaDeterminada = (dividasExistentes || []).find((d: any) => {
          return d.codigo_barras && String(d.codigo_barras).replace(/\D/g, "") === cb;
        });
      }
    }

    // Se encontramos dívida correspondente determinística:
    if (dividaDeterminada) {
      const isQuitada = dividaDeterminada.status === "paga" || dividaDeterminada.status === "quitada";

      // Atualiza o vínculo no gmail_mensagens_processadas sem duplicar dívida
      if (chaveAcesso) {
        await client
          .from("gmail_mensagens_processadas")
          .update({
            divida_id: dividaDeterminada.id,
            status: "processado",
          })
          .eq("workspace_id", context.workspaceId)
          .contains("detalhes_extracao", { chave_acesso: chaveAcesso });
      }

      // Persiste a NF e itens para fins de custos/CMV se ainda não existirem
      await persistirNfeCompraEItensComRollback(
        client,
        context,
        payload,
        chaveAcesso,
        numeroNota,
        razaoSocial,
        cnpj,
        valorTotal,
      );

      return {
        recordId: dividaDeterminada.id,
        data: {
          dividaId: dividaDeterminada.id,
          status: isQuitada ? "already_paid" : "already_exists",
          jaExistia: true,
          isQuitada,
          message: isQuitada
            ? "Documento fiscal vinculado com sucesso à dívida quitada existente, preservando o pagamento e histórico."
            : "Documento fiscal vinculado à dívida pendente já existente.",
        },
      };
    }

    // ── GATE 2: SUSPEITA DE DUPLICIDADE (HEURÍSTICA DE REVISÃO) ───────────────
    // Se não há match determinístico, mas coincide CNPJ/credor, valor e data de vencimento:
    const suspeita = (dividasExistentes || []).find((d: any) => {
      const matchDoc = d.documento_favorecido && cnpj && d.documento_favorecido.replace(/\D/g, "") === cnpj;
      const matchCredor = d.credor && razaoSocial && (
        d.credor.toLowerCase().includes(razaoSocial.toLowerCase().split(" ")[0]) ||
        razaoSocial.toLowerCase().includes(d.credor.toLowerCase().split(" ")[0])
      );
      const matchValor = Math.abs(Number(d.valor_total) - valorTotal) < 0.05;
      const matchData = d.data_vencimento === dataVencimentoPrimeira;
      return (matchDoc || matchCredor) && matchValor && matchData;
    });

    if (suspeita && !payload.ignorar_suspeita_duplicidade) {
      throw new ActionGatewayError(
        "WALLET_AI_ACTION_SUSPECTED_DUPLICATE",
        409,
        `Suspeita de duplicidade financeira detectada: já existe dívida de R$ ${valorTotal.toFixed(2)} com vencimento em ${dataVencimentoPrimeira} do fornecedor "${suspeita.credor}" (Status: ${suspeita.status}, ID: ${suspeita.id}). Conforme política de segurança (Gate 2), a associação não pode ser feita automaticamente sem conferência humana.`,
      );
    }

    // ── GATE 4 & 5: INSERÇÃO SEGURA COM SUPORTE A MÚLTIPLAS PARCELAS ───────────
    const idsCriados: string[] = [];

    try {
      if (duplicatas.length > 1) {
        // Inserção da 1ª parcela
        const d1 = duplicatas[0] as Record<string, unknown>;
        const v1 = Number(d1.valor);
        const dt1 = String(d1.vencimento).trim();
        const desc1 = `NF-e nº ${numeroNota || "S/N"} — Parcela 1/${duplicatas.length} — ${razaoSocial}${chaveAcesso ? ` (Chave: ${chaveAcesso})` : ""}`;

        const { data: p1, error: errP1 } = await client
          .from("dividas")
          .insert([{
            user_id: context.userId,
            workspace_id: context.workspaceId,
            descricao: desc1,
            credor: razaoSocial,
            documento_favorecido: cnpj || null,
            valor_total: v1,
            valor_pago: 0,
            valor_restante: v1,
            data_vencimento: dt1,
            status: "pendente",
            metodo_pagamento_esperado: "boleto",
            parcelas: duplicatas.length,
            parcelas_pagas: 0,
            parcela_atual: 1,
            total_parcelas: duplicatas.length,
          }])
          .select("id")
          .single();

        if (errP1 || !p1) {
          throw new ActionGatewayError(
            "WALLET_AI_ACTION_EXECUTION_ERROR",
            500,
            `Erro ao persistir parcela 1 da NF-e: ${errP1?.message ?? "Falha na inserção"}`,
          );
        }
        idsCriados.push(p1.id);

        // Inserção das parcelas 2..N com parent_id = p1.id
        for (let i = 1; i < duplicatas.length; i++) {
          const di = duplicatas[i] as Record<string, unknown>;
          const vi = Number(di.valor);
          const dti = String(di.vencimento).trim();
          const desci = `NF-e nº ${numeroNota || "S/N"} — Parcela ${i + 1}/${duplicatas.length} — ${razaoSocial}${chaveAcesso ? ` (Chave: ${chaveAcesso})` : ""}`;

          const { data: pi, error: errPi } = await client
            .from("dividas")
            .insert([{
              user_id: context.userId,
              workspace_id: context.workspaceId,
              parent_id: p1.id,
              descricao: desci,
              credor: razaoSocial,
              documento_favorecido: cnpj || null,
              valor_total: vi,
              valor_pago: 0,
              valor_restante: vi,
              data_vencimento: dti,
              status: "pendente",
              metodo_pagamento_esperado: "boleto",
              parcelas: duplicatas.length,
              parcelas_pagas: 0,
              parcela_atual: i + 1,
              total_parcelas: duplicatas.length,
            }])
            .select("id")
            .single();

          if (errPi || !pi) {
            throw new ActionGatewayError(
              "WALLET_AI_ACTION_EXECUTION_ERROR",
              500,
              `Erro ao persistir parcela ${i + 1} da NF-e: ${errPi?.message ?? "Falha na inserção"}`,
            );
          }
          idsCriados.push(pi.id);
        }
      } else {
        // Inserção de parcela única
        const descUnica = `NF-e nº ${numeroNota || "S/N"} — ${razaoSocial}${chaveAcesso ? ` (Chave: ${chaveAcesso})` : ""}`;
        const { data: novaDivida, error: errDivida } = await client
          .from("dividas")
          .insert([{
            user_id: context.userId,
            workspace_id: context.workspaceId,
            descricao: descUnica,
            credor: razaoSocial,
            documento_favorecido: cnpj || null,
            valor_total: valorTotal,
            valor_pago: 0,
            valor_restante: valorTotal,
            data_vencimento: dataVencimentoPrimeira,
            status: "pendente",
            metodo_pagamento_esperado: "boleto",
            parcelas: 1,
            parcelas_pagas: 0,
            parcela_atual: 1,
            total_parcelas: 1,
          }])
          .select("id")
          .single();

        if (errDivida || !novaDivida) {
          throw new ActionGatewayError(
            "WALLET_AI_ACTION_EXECUTION_ERROR",
            500,
            `Erro ao persistir dívida da NF-e: ${errDivida?.message ?? "Falha na inserção"}`,
          );
        }
        idsCriados.push(novaDivida.id);
      }

      // Persiste notas_fiscais_compra e nf_itens
      await persistirNfeCompraEItensComRollback(
        client,
        context,
        payload,
        chaveAcesso,
        numeroNota,
        razaoSocial,
        cnpj,
        valorTotal,
      );

      // Atualiza mensagem no Gmail
      if (chaveAcesso) {
        await client
          .from("gmail_mensagens_processadas")
          .update({
            divida_id: idsCriados[0],
            status: "processado",
          })
          .eq("workspace_id", context.workspaceId)
          .contains("detalhes_extracao", { chave_acesso: chaveAcesso });
      }

      return {
        recordId: idsCriados[0],
        data: {
          dividaId: idsCriados[0],
          dividasIds: idsCriados,
          jaExistia: false,
          totalParcelas: idsCriados.length,
          status: "criada_pendente",
        },
      };
    } catch (error) {
      // ── GATE 5: ROLLBACK COMPENSATÓRIO TRANSACIONAL ─────────────────────────
      // Se qualquer etapa falhar após criar dívidas, remove os registros criados
      if (idsCriados.length > 0) {
        try {
          await client
            .from("dividas")
            .delete()
            .in("id", idsCriados);
        } catch {
          // Erro no rollback compensatório
        }
      }
      throw error;
    }
  });
}

/**
 * Persiste a nota fiscal de compra e seus itens com validação estrita.
 * Lança erro explícito em caso de falha de persistência para acionar o rollback da dívida.
 */
async function persistirNfeCompraEItensComRollback(
  client: SupabaseClient,
  context: AiExecutionContext,
  payload: Record<string, unknown>,
  chaveAcesso: string,
  numeroNota: string,
  razaoSocial: string,
  cnpj: string,
  valorTotal: number,
): Promise<void> {
  if (!chaveAcesso) return;

  const { data: nfExistente, error: errQueryNf } = await client
    .from("notas_fiscais_compra")
    .select("id")
    .eq("workspace_id", context.workspaceId)
    .eq("chave_acesso", chaveAcesso)
    .maybeSingle();

  if (errQueryNf) {
    throw new ActionGatewayError(
      "WALLET_AI_ACTION_EXECUTION_ERROR",
      500,
      `Erro ao consultar nota fiscal de compra: ${errQueryNf.message}`,
    );
  }

  let nfCompraId = nfExistente?.id;
  if (!nfCompraId) {
    const valores = (payload.valores || {}) as Record<string, unknown>;
    const { data: novaNf, error: errInsertNf } = await client
      .from("notas_fiscais_compra")
      .insert([{
        user_id: context.userId,
        workspace_id: context.workspaceId,
        numero_nf: numeroNota || null,
        fornecedor: razaoSocial,
        cnpj_fornecedor: cnpj || null,
        valor_total: valorTotal,
        valor_produtos: Number(valores.valorProdutos ?? valorTotal),
        chave_acesso: chaveAcesso,
        status: "aprovada",
        origem: "gmail",
      }])
      .select("id")
      .single();

    if (errInsertNf || !novaNf) {
      throw new ActionGatewayError(
        "WALLET_AI_ACTION_EXECUTION_ERROR",
        500,
        `Erro ao persistir nota fiscal de compra: ${errInsertNf?.message ?? "Falha na inserção"}`,
      );
    }
    nfCompraId = novaNf.id;
  }

  const itens = Array.isArray(payload.itens) ? payload.itens : [];
  if (nfCompraId && itens.length > 0) {
    // Verificar se itens já foram cadastrados para evitar duplicidade de itens
    const { data: itensExistentes, error: errCheckItens } = await client
      .from("nf_itens")
      .select("id")
      .eq("nf_id", nfCompraId);

    if (errCheckItens) {
      throw new ActionGatewayError(
        "WALLET_AI_ACTION_EXECUTION_ERROR",
        500,
        `Erro ao verificar itens da nota fiscal: ${errCheckItens.message}`,
      );
    }

    if (!itensExistentes || itensExistentes.length === 0) {
      const itensRows = itens.map((it: any) => ({
        nf_id: nfCompraId,
        codigo_produto: String(it.codigoProduto || it.codigo || ""),
        descricao: String(it.descricao || ""),
        ncm: String(it.ncm || ""),
        cfop: String(it.cfop || ""),
        unidade: String(it.unidade || "UN"),
        quantidade: Number(it.quantidade || 1),
        valor_unitario: Number(it.valorUnitario || 0),
        valor_total: Number(it.valorTotal || 0),
        custo_unitario_liquido: Number(it.valorUnitario || 0),
        status_estoque: "pendente",
      }));

      const { error: errInsertItens } = await client
        .from("nf_itens")
        .insert(itensRows);

      if (errInsertItens) {
        throw new ActionGatewayError(
          "WALLET_AI_ACTION_EXECUTION_ERROR",
          500,
          `Erro ao persistir itens fiscais: ${errInsertItens.message}`,
        );
      }
    }
  }
}

export function registerFechamentoActionHandlers(registry: ActionExecutorRegistry): void {
  registry.register("confirmar_fechamento_caixa", async (payload, context, client) => {
    const fechamentoId = String(payload.fechamento_id || "").trim();
    if (!fechamentoId) {
      throw new ActionGatewayError(
        "WALLET_AI_ACTION_INVALID",
        400,
        "fechamento_id obrigatório para confirmar fechamento de caixa.",
      );
    }

    const nowIso = new Date().toISOString();
    const updates: Record<string, unknown> = {
      status: "conferido",
      conferido_por: context.userId,
      conferido_em: nowIso,
      updated_at: nowIso,
    };

    if (typeof payload.observacao === "string" && payload.observacao.trim()) {
      updates.observacao = payload.observacao.trim();
    }

    const { data, error } = await client
      .from("fechamentos_caixa")
      .update(updates)
      .eq("id", fechamentoId)
      .eq("workspace_id", context.workspaceId)
      .select("id, status, data_fechamento, sobra")
      .single();

    if (error || !data) {
      throw new ActionGatewayError(
        "WALLET_AI_ACTION_EXECUTION_ERROR",
        500,
        `Erro ao confirmar fechamento de caixa: ${error?.message ?? "Registro não encontrado no workspace"}`,
      );
    }

    return { recordId: data.id, data };
  });
}

/**
 * Cria o ActionExecutorRegistry padrão canônico.
 * 
 * AUDITORIA DE SEGURANÇA & ROLLOUT:
 * - Metas: opera 100% Proposal-only por padrão por não ter workspace_id no schema legado.
 * - Boleto: executor ativo com isolamento multi-tenant garantido por workspace_id em public.dividas.
 */
export function createDefaultActionExecutorRegistry(options?: {
  enableUserScopedMetaExecutors?: boolean;
  disableBoletoExecutor?: boolean;
  disableNfeExecutor?: boolean;
}): ActionExecutorRegistry {
  const registry = new ActionExecutorRegistry();

  if (options?.enableUserScopedMetaExecutors) {
    registerMetaActionHandlers(registry);
  }

  if (!options?.disableBoletoExecutor) {
    registerBoletoActionHandlers(registry);
  }

  if (!options?.disableNfeExecutor) {
    registerNfeActionHandlers(registry);
  }

  registerFechamentoActionHandlers(registry);

  return registry;
}

export class SupabaseActionDatabaseMutator {
  constructor(
    private readonly client: SupabaseClient,
    private readonly registry: ActionExecutorRegistry = createDefaultActionExecutorRegistry(),
  ) {}

  async executeMutation(
    actionType: string,
    payload: Record<string, unknown>,
    context: AiExecutionContext,
  ): Promise<{ success: boolean; recordId?: string; data?: unknown }> {
    // 1. Bloqueio incondicional de exclusão
    if (actionType === "deletar_transacao") {
      throw new ActionGatewayError(
        "WALLET_AI_ACTION_FORBIDDEN",
        403,
        "Operação de exclusão bloqueada por política de segurança de alto risco.",
      );
    }

    // 2. Localiza executor no registro
    const handler = this.registry.get(actionType);
    if (!handler) {
      // Se a ação for reconhecida no catálogo mas não possuir executor ativo (Proposal-only / Phase 2 e 3)
      throw new ActionGatewayError(
        "WALLET_AI_ACTION_FORBIDDEN",
        403,
        `Ação "${actionType}" opera em modo Proposal-only nesta fase de rollout. Nenhuma mutação direta permitida.`,
      );
    }

    const result = await handler(payload, context, this.client);
    return {
      success: true,
      recordId: result.recordId,
      data: result.data,
    };
  }
}
