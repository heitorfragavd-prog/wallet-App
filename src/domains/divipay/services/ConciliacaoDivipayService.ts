// ConciliacaoDivipayService — motor de 3 camadas para transformar saques/pagamentos
// Divipay (Pix DICT e boleto BILLET) em despesas SEM duplicar dívidas cadastradas.
//
// Camada 1 (auto):     documento do favorecido bate + valor ≈ valor_restante → baixa direta
// Camada 2 (pendente): valor bate mas falta confiança → inbox de confirmação
// Camada 3 (avulsa):   sem candidato → despesa avulsa categorizada
//
// A taxa Divipay vira SEMPRE uma despesa separada ("Taxas Divipay / Tarifas Bancárias"),
// mantendo a despesa principal com o valor exato do boleto/Pix (Decisão A do usuário).

import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/core/logging/LoggerService";
import type { DivipayTransacao } from "@/domains/divipay/types";
import type { Database } from "@/integrations/supabase/types";
import {
  avaliarSaque,
  isSaqueConcluido,
  type DividaCandidata,
  type SaqueParaConciliar,
} from "./conciliacaoMatcher";
import { resolveBeneficiary } from "../utils";

const COMPONENT = "ConciliacaoDivipayService";

export type DivipayConciliacao = Database["public"]["Tables"]["divipay_conciliacoes"]["Row"];

export interface ResumoConciliacao {
  processados: number;
  conciliadasAuto: number;
  pendentes: number;
  avulsas: number;
  ignorados: number;
}

const CATEGORIA_SAQUES = "Transferências e Saques Divipay";
const CATEGORIA_TAXAS = "Taxas Divipay / Tarifas Bancárias";

// ─── Helpers de banco ───────────────────────────────────────────────────

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Usuário não autenticado");
  return data.user.id;
}

async function findOrCreateCategoria(
  userId: string,
  nome: string,
  icone: string,
  cor: string,
): Promise<string | null> {
  const { data: existente } = await supabase
    .from("categorias")
    .select("id")
    .eq("user_id", userId)
    .eq("nome", nome)
    .eq("tipo", "despesa")
    .maybeSingle();
  if (existente) return existente.id;

  const { data: nova, error } = await supabase
    .from("categorias")
    .insert({ user_id: userId, nome, tipo: "despesa", icone, cor })
    .select("id")
    .single();
  if (error) {
    logger.error(COMPONENT, `Erro ao criar categoria ${nome}`, { error: error.message });
    return null;
  }
  return nova.id;
}

async function findContaDivipay(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("contas_usuario")
    .select("id")
    .eq("user_id", userId)
    .ilike("nome", "%divipay%")
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Resolve o workspace das despesas importadas: usa o workspace ativo na UI;
 * sem ele (webhook/fallback), cai no workspace default do usuário.
 */
async function resolveWorkspaceId(userId: string, workspaceId?: string | null): Promise<string | null> {
  if (workspaceId) return workspaceId;
  const { data } = await supabase
    .from("workspaces")
    .select("id")
    .eq("user_id", userId)
    .eq("is_default", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/** Despesa já criada para este saque? (dedupe por marcador nas observações) */
async function despesaJaExiste(userId: string, marcador: string): Promise<string | null> {
  const { data } = await supabase
    .from("despesas")
    .select("id")
    .eq("user_id", userId)
    .ilike("observacoes", `%${marcador}%`)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

async function criarDespesaTaxa(
  userId: string,
  saque: SaqueParaConciliar,
  workspaceId?: string | null,
): Promise<string | null> {
  if (!saque.taxa || saque.taxa <= 0) return null;
  const marcador = `divipay-taxa:${saque.externalId}`;
  const existente = await despesaJaExiste(userId, marcador);
  if (existente) return existente;

  const { data, error } = await supabase
    .from("despesas")
    .insert({
      user_id: userId,
      categoria_id: await findOrCreateCategoria(userId, CATEGORIA_TAXAS, "Percent", "#ef4444"),
      conta_id: await findContaDivipay(userId),
      workspace_id: await resolveWorkspaceId(userId, workspaceId),
      descricao: `Taxa Divipay - ${saque.tipo === "BILLET" ? "boleto" : "Pix"} ${saque.favorecidoNome ?? saque.externalId}`,
      valor: saque.taxa,
      data: saque.dataPagamento.slice(0, 10),
      observacoes: `Taxa do saque Divipay ${saque.externalId} (${marcador})`,
      metodo_pagamento: "pix",
      status: "pago",
    })
    .select("id")
    .single();
  if (error) {
    logger.error(COMPONENT, "Erro ao criar despesa de taxa", { error: error.message });
    return null;
  }
  return data.id;
}

async function criarDespesaAvulsa(
  userId: string,
  saque: SaqueParaConciliar,
  workspaceId?: string | null,
): Promise<string | null> {
  const marcador = `divipay-saque:${saque.externalId}`;
  const existente = await despesaJaExiste(userId, marcador);
  if (existente) return existente;

  const tipoLegivel = saque.tipo === "BILLET" ? "Pagamento de boleto" : "Pagamento Pix";
  const { data, error } = await supabase
    .from("despesas")
    .insert({
      user_id: userId,
      categoria_id: await findOrCreateCategoria(userId, CATEGORIA_SAQUES, "ArrowUpRight", "#f97316"),
      conta_id: await findContaDivipay(userId),
      workspace_id: await resolveWorkspaceId(userId, workspaceId),
      descricao: saque.descricao || `${tipoLegivel} Divipay - ${saque.favorecidoNome ?? "favorecido"}`,
      valor: saque.valor,
      data: saque.dataPagamento.slice(0, 10),
      observacoes: `Importado via Divipay API (${marcador})`,
      metodo_pagamento: "pix",
      status: "pago",
    })
    .select("id")
    .single();
  if (error) {
    logger.error(COMPONENT, "Erro ao criar despesa avulsa", { error: error.message });
    return null;
  }
  return data.id;
}

/**
 * Dá baixa numa dívida a partir de um saque Divipay.
 * Replica a lógica de usePagamentosDivida.createPagamento:
 * insere pagamentos_dividas (o trigger sync_pagamento_divida_to_despesa cria a despesa)
 * e atualiza valor_pago/parcelas/status/vencimento da dívida.
 * Idempotente via índice único pagamentos_dividas.divipay_external_id.
 */
async function baixarDivida(
  userId: string,
  dividaId: string,
  saque: SaqueParaConciliar,
): Promise<boolean> {
  const { data: divida, error: dividaError } = await supabase
    .from("dividas")
    .select("*")
    .eq("id", dividaId)
    .single();
  if (dividaError || !divida) {
    logger.error(COMPONENT, "Dívida não encontrada para baixa", { dividaId });
    return false;
  }

  const valorBaixa = Math.min(saque.valor, Number(divida.valor_restante));
  if (valorBaixa <= 0) return false;

  const { error: pagError } = await supabase.from("pagamentos_dividas").insert({
    divida_id: dividaId,
    user_id: userId,
    valor: valorBaixa,
    data_pagamento: saque.dataPagamento.slice(0, 10),
    metodo_pagamento: "pix",
    conta_id: await findContaDivipay(userId),
    observacoes: `Pago via Divipay (${saque.tipo === "BILLET" ? "boleto" : "Pix"}) - ${saque.externalId}`,
    divipay_external_id: saque.externalId,
  });

  if (pagError) {
    // 23505 = unique violation → baixa já feita para este saque (idempotente)
    if (pagError.code === "23505") return true;
    logger.error(COMPONENT, "Erro ao registrar pagamento da dívida", { error: pagError.message });
    return false;
  }

  const novoValorPago = Number(divida.valor_pago) + valorBaixa;
  const novasParcelasPagas = Math.min(Number(divida.parcelas_pagas) + 1, Number(divida.parcelas));
  const todasPagas = novasParcelasPagas >= Number(divida.parcelas);
  const novoValorRestante = todasPagas ? 0 : Math.max(0, Number(divida.valor_total) - novoValorPago);
  const novoStatus = todasPagas
    ? "quitada"
    : new Date(divida.data_vencimento) < new Date()
      ? "vencida"
      : "pendente";

  let novaDataVencimento = divida.data_vencimento;
  if (!todasPagas) {
    const venc = new Date(`${divida.data_vencimento}T00:00:00`);
    venc.setMonth(venc.getMonth() + 1);
    novaDataVencimento = venc.toISOString().split("T")[0];
  }

  const { error: upError } = await supabase
    .from("dividas")
    .update({
      valor_pago: novoValorPago,
      valor_restante: novoValorRestante,
      parcelas_pagas: novasParcelasPagas,
      data_vencimento: novaDataVencimento,
      status: novoStatus,
    })
    .eq("id", dividaId);

  if (upError) {
    logger.error(COMPONENT, "Erro ao atualizar dívida após baixa", { error: upError.message });
    return false;
  }
  return true;
}

// ─── Mapeamento: DivipayTransacao → SaqueParaConciliar ──────────────────

export function mapearSaque(t: DivipayTransacao): SaqueParaConciliar | null {
  const externalId = t.external_id ?? (t.id.startsWith("api-") ? t.id.slice(4) : t.id);
  if (!externalId) return null;
  const meta = (t.metadata ?? {}) as Record<string, unknown>;
  const isBoleto = typeof meta.paymentType === "string" ? meta.paymentType === "BILLET" : String(t.description || "").toLowerCase().includes("boleto");
  const resolved = resolveBeneficiary(Number(t.amount || 0), t.description || "", isBoleto ? "Boleto" : "Pix");
  
  return {
    externalId,
    tipo: typeof meta.paymentType === "string" ? meta.paymentType : null,
    favorecidoNome:
      (typeof meta.payerName === "string" && meta.payerName) ||
      resolved.name ||
      t.recipient_key ||
      null,
    favorecidoDocumento:
      (typeof meta.document === "string" && meta.document && meta.document !== "---")
        ? meta.document
        : resolved.document || null,
    valor: Number(t.amount || 0),
    taxa: Number(t.fee || meta.tax || 3.50),
    dataPagamento: t.created_at,
    descricao: t.description ?? null,
  };
}

// ─── Service ────────────────────────────────────────────────────────────

export class ConciliacaoDivipayService {
  /** Lista conciliações (padrão: pendentes, mais recentes primeiro). */
  async listar(status?: string): Promise<DivipayConciliacao[]> {
    const userId = await requireUserId();
    let query = supabase
      .from("divipay_conciliacoes")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  /**
   * Processa os saques mais recentes: cria conciliações, dá baixas automáticas
   * e gera despesas avulsas. Seguro para rodar várias vezes (idempotente).
   */
  async conciliar(transacoes: DivipayTransacao[], workspaceId?: string | null): Promise<ResumoConciliacao> {
    const resumo: ResumoConciliacao = {
      processados: 0,
      conciliadasAuto: 0,
      pendentes: 0,
      avulsas: 0,
      ignorados: 0,
    };
    if (transacoes.length === 0) return resumo;

    const userId = await requireUserId();
    const wsId = await resolveWorkspaceId(userId, workspaceId);

    // O que já foi processado/importado antes (paginado: o PostgREST corta
    // em 1000 linhas por requisição — sem isso, com o histórico completo,
    // a anti-duplicidade falharia e criaria despesas em dobro)
    const jaProcessados = new Set<string>();
    for (let offset = 0; offset < 50000; offset += 1000) {
      const { data: lote } = await supabase
        .from("divipay_conciliacoes")
        .select("divipay_external_id")
        .eq("user_id", userId)
        .range(offset, offset + 999);
      const rows = lote ?? [];
      rows.forEach((c) => jaProcessados.add(c.divipay_external_id));
      if (rows.length < 1000) break;
    }

    // Transações locais criadas pelo app (webhook pode já ter lançado a despesa)
    const { data: locais } = await supabase
      .from("divipay_transacoes")
      .select("external_id, status, metadata")
      .eq("user_id", userId)
      .eq("type", "CASH_OUT");
    const localPorExternalId = new Map(
      (locais ?? [])
        .filter((l) => l.external_id)
        .map((l) => [l.external_id as string, l]),
    );

    // Dívidas abertas para o motor de match
    const { data: dividas } = await supabase
      .from("dividas")
      .select("id, descricao, credor, documento_favorecido, valor_restante, data_vencimento")
      .eq("user_id", userId)
      .neq("status", "quitada")
      .gt("valor_restante", 0);
    const dividasAbertas: DividaCandidata[] = (dividas ?? []).map((d) => ({
      id: d.id,
      descricao: d.descricao,
      credor: d.credor,
      documento_favorecido: d.documento_favorecido,
      valor_restante: Number(d.valor_restante),
      data_vencimento: d.data_vencimento,
    }));

    for (const t of transacoes) {
      const saque = mapearSaque(t);
      if (!saque || saque.valor <= 0) continue;
      if (jaProcessados.has(saque.externalId)) {
        resumo.ignorados++;
        continue;
      }

      const local = localPorExternalId.get(saque.externalId);
      const localMeta = (local?.metadata ?? {}) as Record<string, unknown>;

      // Saque iniciado pelo app ainda pendente: aguarda conclusão
      const statusEfetivo = String(local?.status ?? t.status ?? "");
      if (!isSaqueConcluido(statusEfetivo)) {
        resumo.ignorados++;
        continue;
      }

      // Webhook já lançou a despesa desse saque iniciado pelo app
      if (local && localMeta.despesa_id) {
        await this.registrarConciliacao(userId, saque, "importada", {
          despesaId: String(localMeta.despesa_id),
          dividaId: typeof localMeta.divida_id === "string" ? localMeta.divida_id : null,
        });
        resumo.ignorados++;
        continue;
      }

      // Saque iniciado pelo app com divida_id na metadata: baixa direta (fallback do webhook)
      if (local && typeof localMeta.divida_id === "string" && localMeta.divida_id) {
        const ok = await baixarDivida(userId, localMeta.divida_id, saque);
        if (ok) {
          await criarDespesaTaxa(userId, saque, wsId);
          await this.registrarConciliacao(userId, saque, "conciliada", {
            dividaId: localMeta.divida_id,
          });
          resumo.processados++;
          resumo.conciliadasAuto++;
        }
        continue;
      }

      // Motor de 3 camadas (pagamentos externos, feitos no painel Divipay)
      const resultado = avaliarSaque(saque, dividasAbertas);
      resumo.processados++;

      if (resultado.camada === "auto") {
        const ok = await baixarDivida(userId, resultado.divida.id, saque);
        if (ok) {
          await criarDespesaTaxa(userId, saque, wsId);
          await this.registrarConciliacao(userId, saque, "conciliada", {
            dividaId: resultado.divida.id,
          });
          // Atualiza o pool local para não conciliar duas vezes a mesma dívida
          resultado.divida.valor_restante = Math.max(0, resultado.divida.valor_restante - saque.valor);
          resumo.conciliadasAuto++;
        }
      } else if (resultado.camada === "pendente") {
        await this.registrarConciliacao(userId, saque, "pendente", {
          dividaSugeridaId: resultado.dividaSugerida?.id ?? null,
        });
        resumo.pendentes++;
      } else {
        const despesaId = await criarDespesaAvulsa(userId, saque, wsId);
        await criarDespesaTaxa(userId, saque, wsId);
        await this.registrarConciliacao(userId, saque, "importada", { despesaId });
        resumo.avulsas++;
      }
    }

    logger.info(COMPONENT, "Conciliação concluída", { ...resumo });
    return resumo;
  }

  private async registrarConciliacao(
    userId: string,
    saque: SaqueParaConciliar,
    status: "pendente" | "conciliada" | "importada" | "ignorada",
    extra: { dividaId?: string | null; dividaSugeridaId?: string | null; despesaId?: string | null } = {},
  ): Promise<void> {
    const { error } = await supabase.from("divipay_conciliacoes").upsert(
      {
        user_id: userId,
        divipay_external_id: saque.externalId,
        tipo: saque.tipo,
        favorecido_nome: saque.favorecidoNome,
        favorecido_documento: saque.favorecidoDocumento,
        valor: saque.valor,
        taxa: saque.taxa,
        data_pagamento: saque.dataPagamento,
        descricao: saque.descricao,
        status,
        divida_id: extra.dividaId ?? null,
        divida_sugerida_id: extra.dividaSugeridaId ?? null,
        despesa_id: extra.despesaId ?? null,
      },
      { onConflict: "user_id,divipay_external_id" },
    );
    if (error) {
      logger.error(COMPONENT, "Erro ao registrar conciliação", { error: error.message });
    }
  }

  /** Camada 2 → confirma que o saque pagou uma dívida (a sugerida ou outra). */
  async confirmar(conciliacao: DivipayConciliacao, dividaId: string, workspaceId?: string | null): Promise<boolean> {
    const userId = await requireUserId();
    const saque: SaqueParaConciliar = {
      externalId: conciliacao.divipay_external_id,
      tipo: conciliacao.tipo,
      favorecidoNome: conciliacao.favorecido_nome,
      favorecidoDocumento: conciliacao.favorecido_documento,
      valor: Number(conciliacao.valor),
      taxa: Number(conciliacao.taxa),
      dataPagamento: conciliacao.data_pagamento ?? new Date().toISOString(),
      descricao: conciliacao.descricao,
    };

    const ok = await baixarDivida(userId, dividaId, saque);
    if (!ok) return false;
    await criarDespesaTaxa(userId, saque, workspaceId);

    const { error } = await supabase
      .from("divipay_conciliacoes")
      .update({ status: "conciliada", divida_id: dividaId })
      .eq("id", conciliacao.id);
    return !error;
  }

  /** Camada 2 → usuário diz que NÃO é dívida: vira despesa avulsa. */
  async importarAvulsa(conciliacao: DivipayConciliacao, workspaceId?: string | null): Promise<boolean> {
    const userId = await requireUserId();
    const saque: SaqueParaConciliar = {
      externalId: conciliacao.divipay_external_id,
      tipo: conciliacao.tipo,
      favorecidoNome: conciliacao.favorecido_nome,
      favorecidoDocumento: conciliacao.favorecido_documento,
      valor: Number(conciliacao.valor),
      taxa: Number(conciliacao.taxa),
      dataPagamento: conciliacao.data_pagamento ?? new Date().toISOString(),
      descricao: conciliacao.descricao,
    };

    const despesaId = await criarDespesaAvulsa(userId, saque, workspaceId);
    await criarDespesaTaxa(userId, saque, workspaceId);

    const { error } = await supabase
      .from("divipay_conciliacoes")
      .update({ status: "importada", despesa_id: despesaId })
      .eq("id", conciliacao.id);
    return !error;
  }

  /** Ignora o saque (não é despesa do negócio — ex: transferência entre contas). */
  async ignorar(conciliacaoId: string): Promise<boolean> {
    const { error } = await supabase
      .from("divipay_conciliacoes")
      .update({ status: "ignorada" })
      .eq("id", conciliacaoId);
    return !error;
  }

  /** Vincula divida_id na transação local (usado pelo botão "Pagar via Divipay"). */
  async vincularDividaNaTransacao(transacaoId: string, dividaId: string): Promise<void> {
    const { data: atual } = await supabase
      .from("divipay_transacoes")
      .select("metadata")
      .eq("id", transacaoId)
      .single();
    const metadata = { ...((atual?.metadata ?? {}) as Record<string, unknown>), divida_id: dividaId };
    const { error } = await supabase
      .from("divipay_transacoes")
      .update({ metadata })
      .eq("id", transacaoId);
    if (error) {
      logger.error(COMPONENT, "Erro ao vincular dívida na transação", { error: error.message });
    }
  }
}

export const conciliacaoDivipayService = new ConciliacaoDivipayService();
