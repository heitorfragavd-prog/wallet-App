// ConciliacaoDivipayService — motor de identificação e conciliação financeira automatizada
// para transformar saques/pagamentos Divipay (Pix DICT e boleto BILLET) em despesas,
// vinculando-os automaticamente a fornecedores, funcionários e sócios cadastrados.

import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/core/logging/LoggerService";
import { divipayService } from "./DivipayService";
import type { DivipayTransacao } from "@/domains/divipay/types";
import type { Database } from "@/integrations/supabase/types";
import {
  isSaqueConcluido,
  type DividaCandidata,
  type SaqueParaConciliar,
} from "./conciliacaoMatcher";
import {
  ConciliacaoFinanceiraAvancada,
  type ColaboradorCandidato,
  type AcertoEquipeCandidato,
} from "./conciliacaoFinanceiraAvancada";
import { resolveBeneficiary } from "../utils";
import type { Contato } from "@/domains/finance/hooks/useContatos";


type DynamicDb = {
  from: (table: string) => {
    select: (cols?: string) => DynamicDb;
    insert: (values: unknown) => DynamicDb;
    update: (values: unknown) => DynamicDb;
    upsert: (values: unknown, opts?: unknown) => DynamicDb;
    delete: () => DynamicDb;
    eq: (col: string, val: unknown) => DynamicDb;
    neq: (col: string, val: unknown) => DynamicDb;
    in: (col: string, vals: unknown[]) => DynamicDb;
    or: (filter: string) => DynamicDb;
    gt: (col: string, val: unknown) => DynamicDb;
    order: (col: string, opts?: unknown) => DynamicDb;
    range: (from: number, to: number) => DynamicDb;
    limit: (count: number) => DynamicDb;
    single: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
    maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
    then: (onfulfilled?: (val: { data: unknown[]; error: unknown }) => unknown) => Promise<unknown>;
  };
  rpc: (fn: string, params?: unknown) => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
};

const dynamicDb = supabase as unknown as DynamicDb;

const COMPONENT = "ConciliacaoDivipayService";

export type DivipayConciliacao = Database["public"]["Tables"]["divipay_conciliacoes"]["Row"] & {
  beneficiario_tipo?: "fornecedor" | "colaborador" | "socio" | "outro" | null;
  contato_id?: string | null;
  colaborador_id?: string | null;
  acerto_id?: string | null;
  categoria_id?: string | null;
  subcategoria_id?: string | null;
  metodo_pagamento?: "pix" | "boleto" | "cartao" | "ted" | "outro" | string | null;
  origem_evidencia?: string | null;
  linha_digitavel?: string | null;
  codigo_barras?: string | null;
  competencia?: string | null;
  comprovante_url?: string | null;
  valor_aplicado?: number | null;
  saldo_remanescente?: number | null;
  revisado_por?: string | null;
  revisado_em?: string | null;
  motivo_revisao?: string | null;
};

export interface ResumoConciliacao {
  processados: number;
  conciliadasAuto: number;
  pendentes: number;
  avulsas: number;
  ignorados: number;
}

export const CATEGORIA_SAQUES = "Transferências e Saques Divipay";
export const CATEGORIA_TAXAS = "Taxas Divipay / Tarifas Bancárias";

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

function requireWorkspaceId(workspaceId?: string | null): string {
  if (!workspaceId || typeof workspaceId !== "string" || !workspaceId.trim()) {
    throw new Error("workspace_id é obrigatório para operações de conciliação Divipay (fail-closed)");
  }
  return workspaceId.trim();
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
  workspaceId: string,
): Promise<string | null> {
  if (!saque.taxa || saque.taxa <= 0) return null;
  const wsId = requireWorkspaceId(workspaceId);
  const marcador = `divipay-taxa:${saque.externalId}`;
  const existente = await despesaJaExiste(userId, marcador);
  if (existente) return existente;

  const { data, error } = await supabase
    .from("despesas")
    .insert({
      user_id: userId,
      categoria_id: await findOrCreateCategoria(userId, CATEGORIA_TAXAS, "Percent", "#ef4444"),
      conta_id: await findContaDivipay(userId),
      workspace_id: wsId,
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

function normalizarTexto(texto: string): string {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function sugerirCategoria(descricao: string): string {
  const desc = normalizarTexto(descricao);

  if (
    desc.includes("alimentacao") ||
    desc.includes("comida") ||
    desc.includes("almoco") ||
    desc.includes("jantar") ||
    desc.includes("lanche") ||
    desc.includes("restaurante") ||
    desc.includes("mercado") ||
    desc.includes("supermercado") ||
    desc.includes("padaria") ||
    desc.includes("biscoito") ||
    desc.includes("salgado") ||
    desc.includes("bebida")
  ) {
    return "Alimentação";
  }

  if (
    desc.includes("transporte") ||
    desc.includes("passagem") ||
    desc.includes("uber") ||
    desc.includes("combustivel") ||
    desc.includes("posto") ||
    desc.includes("gasolina")
  ) {
    return "Transporte";
  }

  if (
    desc.includes("tecnologia") ||
    desc.includes("software") ||
    desc.includes("aws") ||
    desc.includes("google") ||
    desc.includes("internet")
  ) {
    return "Tecnologia";
  }

  if (
    desc.includes("servico") ||
    desc.includes("manutencao") ||
    desc.includes("limpeza") ||
    desc.includes("contador") ||
    desc.includes("salario") ||
    desc.includes("folguista") ||
    desc.includes("colaborador") ||
    desc.includes("acerto")
  ) {
    return "Serviços";
  }

  return "Transferências e Saques Divipay";
}

function sugerirMetodoPagamento(tipo: string): string {
  const t = String(tipo || "").toUpperCase();
  if (t === "BILLET" || t === "BOLETO") {
    return "boleto";
  }
  return "pix";
}

async function criarDespesaAvulsa(
  userId: string,
  saque: SaqueParaConciliar,
  workspaceId: string,
): Promise<string | null> {
  const wsId = requireWorkspaceId(workspaceId);
  const marcador = `divipay-saque:${saque.externalId}`;
  const existente = await despesaJaExiste(userId, marcador);
  if (existente) return existente;

  const descEfetiva = saque.descricao || (saque.tipo === "BILLET" ? "Pagamento de boleto" : "Pagamento Pix") + ` Divipay - ${saque.favorecidoNome ?? "favorecido"}`;
  const catSugerida = sugerirCategoria(descEfetiva);

  let icone = "ArrowUpRight";
  let cor = "#f97316";
  if (catSugerida === "Alimentação") { icone = "Utensils"; cor = "#10b981"; }
  else if (catSugerida === "Transporte") { icone = "Car"; cor = "#3b82f6"; }
  else if (catSugerida === "Tecnologia") { icone = "Cpu"; cor = "#8b5cf6"; }
  else if (catSugerida === "Serviços") { icone = "Briefcase"; cor = "#06b6d4"; }

  const categoriaId = await findOrCreateCategoria(userId, catSugerida, icone, cor);
  const metodoPagamento = sugerirMetodoPagamento(saque.tipo);

  const { data, error } = await supabase
    .from("despesas")
    .insert({
      user_id: userId,
      categoria_id: categoriaId,
      conta_id: await findContaDivipay(userId),
      workspace_id: wsId,
      descricao: descEfetiva,
      valor: saque.valor,
      data: saque.dataPagamento.slice(0, 10),
      observacoes: `Importado via Divipay API (${marcador})`,
      metodo_pagamento: metodoPagamento,
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

async function criarDespesaFornecedor(
  userId: string,
  saque: SaqueParaConciliar,
  fornecedor: Contato,
  categoriaId: string | null | undefined,
  subcategoriaId: string | null | undefined,
  metodoPagamento: "pix" | "boleto",
  workspaceId: string,
): Promise<string | null> {
  const wsId = requireWorkspaceId(workspaceId);
  const marcador = `divipay-saque:${saque.externalId}`;
  const existente = await despesaJaExiste(userId, marcador);
  if (existente) {
    await dynamicDb
      .from("despesas")
      .update({
        contato_id: fornecedor.id,
        categoria_id: categoriaId || fornecedor.categoria_padrao_id || undefined,
        subcategoria_id: subcategoriaId || fornecedor.subcategoria_padrao_id || undefined,
        conciliado: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existente);
    return existente;
  }

  const descEfetiva = saque.descricao || `${metodoPagamento === "boleto" ? "Pagamento Boleto" : "Pagamento Pix"} - ${fornecedor.nome}`;
  const effectiveCatId = categoriaId || fornecedor.categoria_padrao_id || (await findOrCreateCategoria(userId, "Compra de Mercadorias", "ShoppingBag", "#10b981"));

  const { data, error } = await dynamicDb
    .from("despesas")
    .insert({
      user_id: userId,
      categoria_id: effectiveCatId,
      subcategoria_id: subcategoriaId || fornecedor.subcategoria_padrao_id || null,
      conta_id: await findContaDivipay(userId),
      workspace_id: wsId,
      contato_id: fornecedor.id,
      descricao: descEfetiva,
      valor: saque.valor,
      data: saque.dataPagamento.slice(0, 10),
      observacoes: `Importado via Divipay API (${marcador})`,
      metodo_pagamento: metodoPagamento,
      status: "pago",
    })
    .select("id")
    .single();

  if (error) {
    logger.error(COMPONENT, "Erro ao criar despesa para fornecedor", { error: error.message });
    return null;
  }
  return data.id;
}

async function baixarDivida(
  userId: string,
  dividaId: string,
  saque: SaqueParaConciliar,
): Promise<boolean> {
  const { data: divida, error: dError } = await supabase
    .from("dividas")
    .select("*")
    .eq("id", dividaId)
    .single();

  if (dError || !divida) {
    logger.error(COMPONENT, "Dívida não encontrada para baixa", { dividaId });
    return false;
  }

  const valorBaixa = Math.min(saque.valor, Number(divida.valor_restante));
  if (valorBaixa <= 0) return true;

  const { error: pagError } = await supabase.from("pagamentos_dividas").insert({
    divida_id: dividaId,
    user_id: userId,
    valor: valorBaixa,
    data_pagamento: saque.dataPagamento.slice(0, 10),
    metodo_pagamento: saque.tipo === "BILLET" ? "boleto" : "pix",
    conta_id: await findContaDivipay(userId),
    observacoes: `Pago via Divipay (${saque.tipo === "BILLET" ? "Boleto" : "Pix"}) - ${saque.externalId}`,
    divipay_external_id: saque.externalId,
  });

  if (pagError) {
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

export function mapearSaque(t: DivipayTransacao): SaqueParaConciliar | null {
  const externalId = t.external_id ?? (t.id.startsWith("api-") ? t.id.slice(4) : t.id);
  if (!externalId) return null;
  const meta = (t.metadata ?? {}) as Record<string, unknown>;
  const rawType = typeof meta.paymentType === "string" ? meta.paymentType.toUpperCase() : String(t.type || "").toUpperCase();
  const recipientDigits = String(t.recipient_key || "").replace(/\D/g, "");
  const isBoletoBarcode = /^\d{44,48}$/.test(recipientDigits) && !String(t.recipient_key || "").includes("@") && !String(t.recipient_key || "").includes("-");
  const isBoleto = rawType === "BILLET" || rawType === "BOLETO" || isBoletoBarcode;
  const resolved = resolveBeneficiary(Number(t.amount || 0), t.description || "", isBoleto ? "Boleto" : "Pix");

  return {
    externalId,
    tipo: typeof meta.paymentType === "string" ? meta.paymentType : (isBoleto ? "BILLET" : "DICT"),
    favorecidoNome:
      (typeof meta.payerName === "string" && meta.payerName) ||
      (resolved.name !== "---" ? resolved.name : null) ||
      t.recipient_key ||
      null,
    favorecidoDocumento:
      (typeof meta.document === "string" && meta.document && meta.document !== "---")
        ? meta.document
        : (resolved.document !== "---" ? resolved.document : null),
    valor: Number(t.amount || 0),
    taxa: Number(t.fee || meta.tax || 3.5),
    dataPagamento: t.created_at,
    descricao: t.description ?? null,
  };
}

export class ConciliacaoDivipayService {
  async listar(status?: string, workspaceId?: string | null): Promise<DivipayConciliacao[]> {
    const userId = await requireUserId();
    let query = dynamicDb
      .from("divipay_conciliacoes")
      .select("*")
      .eq("user_id", userId)
      .order("data_pagamento", { ascending: false });
    if (workspaceId && typeof workspaceId === "string" && workspaceId.trim()) {
      query = query.eq("workspace_id", workspaceId.trim());
    }
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as DivipayConciliacao[];
  }

  async conciliar(transacoes: DivipayTransacao[], workspaceId?: string | null): Promise<ResumoConciliacao> {
    const resumo: ResumoConciliacao = {
      processados: 0,
      conciliadasAuto: 0,
      pendentes: 0,
      avulsas: 0,
      ignorados: 0,
    };
    if (transacoes.length === 0) return resumo;

    const wsId = requireWorkspaceId(workspaceId);
    const userId = await requireUserId();

    // 1. Carrega dados de Colaboradores e Acertos
    const { data: colabsRaw } = await dynamicDb
      .from("colaboradores")
      .select("id, nome, tipo, pix_chave, pix_chave_normalizada, cpf")
      .eq("workspace_id", wsId);
    const colaboradores: ColaboradorCandidato[] = colabsRaw ?? [];

    const { data: equipeRows } = await dynamicDb
      .from("colaborador_acertos")
      .select("id, colaborador_id, tipo, pix_chave_snapshot, valor_total, vencimento, status")
      .eq("workspace_id", wsId)
      .in("status", ["pendente", "processando"]);
    const acertos: AcertoEquipeCandidato[] = (equipeRows ?? []).map((a: Record<string, unknown>) => ({
      id: a.id,
      colaborador_id: a.colaborador_id,
      tipo: a.tipo,
      valor_total: Number(a.valor_total),
      vencimento: a.vencimento,
      status: a.status,
      pix_chave_snapshot: a.pix_chave_snapshot,
    }));

    // 2. Carrega Fornecedores (contatos com tipo 'fornecedor' e ativos)
    const { data: fornRaw } = await dynamicDb
      .from("contatos")
      .select("*")
      .eq("workspace_id", wsId)
      .eq("tipo", "fornecedor")
      .eq("ativo", true);
    const fornecedores: Contato[] = fornRaw ?? [];

    // 3. Carrega Dívidas em aberto
    const { data: dividasRaw } = await dynamicDb
      .from("dividas")
      .select("id, descricao, credor, documento_favorecido, valor_restante, data_vencimento, categoria_id, linha_digitavel, codigo_barras, contato_id")
      .eq("user_id", userId)
      .eq("workspace_id", wsId)
      .neq("status", "quitada")
      .gt("valor_restante", 0);
    const dividasAbertas: DividaCandidata[] = (dividasRaw ?? []).map((d: Record<string, unknown>) => ({
      id: d.id,
      descricao: d.descricao,
      credor: d.credor,
      documento_favorecido: d.documento_favorecido,
      valor_restante: Number(d.valor_restante),
      data_vencimento: d.data_vencimento,
      workspace_id: wsId,
      categoria_id: d.categoria_id,
      linha_digitavel: d.linha_digitavel,
      codigo_barras: d.codigo_barras,
      contato_id: d.contato_id,
    }));

    // 4. Cache de transações já processadas para idempotência
    const jaProcessados = new Set<string>();
    for (let offset = 0; offset < 50000; offset += 1000) {
      const { data: lote } = await dynamicDb
        .from("divipay_conciliacoes")
        .select("divipay_external_id")
        .eq("user_id", userId)
        .eq("workspace_id", wsId)
        .range(offset, offset + 999);
      const rows = lote ?? [];
      rows.forEach((c: { divipay_external_id: string }) => jaProcessados.add(c.divipay_external_id));
      if (rows.length < 1000) break;
    }

    const { data: locais } = await dynamicDb
      .from("divipay_transacoes")
      .select("external_id, status, metadata")
      .eq("user_id", userId)
      .eq("workspace_id", wsId)
      .eq("type", "CASH_OUT");
    const localPorExternalId = new Map(
      (locais ?? [])
        .filter((l: Record<string, unknown>) => l.external_id)
        .map((l: Record<string, unknown>) => [l.external_id as string, l]),
    );

    // 5. Itera sobre cada saque executando o motor de conciliação avançada
    for (const t of transacoes) {
      const saque = mapearSaque(t);
      if (!saque || saque.valor <= 0) continue;
      if (jaProcessados.has(saque.externalId)) {
        resumo.ignorados++;
        continue;
      }

      const local = localPorExternalId.get(saque.externalId);
      const localMeta = (local?.metadata ?? {}) as Record<string, unknown>;

      const statusEfetivo = String(local?.status ?? t.status ?? "");
      if (!isSaqueConcluido(statusEfetivo)) {
        resumo.ignorados++;
        continue;
      }

      if (local && localMeta.despesa_id) {
        await this.registrarConciliacao(userId, wsId, saque, "importada", {
          despesaId: String(localMeta.despesa_id),
          dividaId: typeof localMeta.divida_id === "string" ? localMeta.divida_id : null,
        });
        resumo.ignorados++;
        continue;
      }

      // Avalia saque com motor avançado (Pix e Boletos)
      const rawTipo = String(saque.tipo || "").toUpperCase();
      const recipientDigits = String(t.recipient_key || "").replace(/\D/g, "");
      const isBoletoBarcode = /^\d{44,48}$/.test(recipientDigits) && !String(t.recipient_key || "").includes("@") && !String(t.recipient_key || "").includes("-");
      const isBoleto = rawTipo === "BILLET" || rawTipo === "BOLETO" || isBoletoBarcode;

      let linhaDigitavel = (localMeta?.billetCode as string) || (t.metadata as Record<string, unknown>)?.billetCode as string || (isBoletoBarcode ? t.recipient_key : null);
      let codigoBarras = (localMeta?.billetCode as string) || (t.metadata as Record<string, unknown>)?.billetCode as string || null;

      if (isBoleto && (!linhaDigitavel || String(linhaDigitavel).length < 20)) {
        try {
          const detail = await divipayService.getWithdraw(saque.externalId, wsId);
          if (detail) {
            const detailBilletCode = (detail as Record<string, unknown>).billetCode as string;
            if (detailBilletCode) {
              linhaDigitavel = detailBilletCode;
              codigoBarras = detailBilletCode;
            }
          }
        } catch (err) {
          logger.warn(COMPONENT, "Não foi possível carregar detalhes do saque para boleto", { externalId: saque.externalId, err });
        }
      }

      const match = ConciliacaoFinanceiraAvancada.avaliarSaque({
        saque: {
          externalId: saque.externalId,
          tipo: saque.tipo,
          valor: saque.valor,
          taxa: saque.taxa,
          dataPagamento: saque.dataPagamento,
          favorecidoNome: saque.favorecidoNome,
          favorecidoDocumento: saque.favorecidoDocumento,
          recipientKey: t.recipient_key,
          descricao: saque.descricao,
          linhaDigitavel: linhaDigitavel || undefined,
          codigoBarras: codigoBarras || undefined,
        },
        colaboradores,
        acertos,
        fornecedores,
        dividas: dividasAbertas,
      });

      // CASO A: Identificado como Colaborador ou Sócio
      if (match.tipo === "colaborador" || match.tipo === "socio") {
        if (match.acertoSugerido) {
          const { error: rpcErr } = await dynamicDb.rpc("confirmar_pagamento_acerto", {
            p_acerto_id: match.acertoSugerido.id,
            p_divipay_external_id: saque.externalId,
            p_pagamento_id: typeof localMeta.pagamento_id === "string" ? localMeta.pagamento_id : null,
            p_origem: "divipay_externo",
            p_valor: saque.valor,
            p_taxa: saque.taxa,
            p_comprovante_url: null,
          });
          if (rpcErr) {
            logger.error(COMPONENT, "Falha ao confirmar pagamento do acerto", { error: rpcErr });
            await this.registrarConciliacao(userId, wsId, saque, "pendente", {
              beneficiarioTipo: match.tipo,
              colaboradorId: match.colaborador.id,
              acertoId: match.acertoSugerido.id,
              motivoRevisao: `Beneficiário identificado, mas falha ao confirmar acerto: ${rpcErr.message ?? String(rpcErr)}`,
              metodoPagamento: "pix",
              origemEvidencia: match.evidencia,
            });
            resumo.processados++;
            resumo.pendentes++;
            continue;
          }
          match.acertoSugerido.status = "pago";
          await criarDespesaTaxa(userId, saque, wsId);
          await this.registrarConciliacao(userId, wsId, saque, "conciliada", {
            beneficiarioTipo: match.tipo,
            colaboradorId: match.colaborador.id,
            acertoId: match.acertoSugerido.id,
            metodoPagamento: "pix",
            origemEvidencia: match.evidencia,
          });
        } else {
          // Pix identificado para colaborador sem acerto prévio: cria registro via RPC manual (tipo 'outro' para não presumir pró-labore)
          const { data: resManual, error: errManual } = await dynamicDb.rpc("registrar_pagamento_colaborador_manual", {
            p_colaborador_id: match.colaborador.id,
            p_tipo: "outro",
            p_periodo_inicio: saque.dataPagamento.slice(0, 10),
            p_periodo_fim: saque.dataPagamento.slice(0, 10),
            p_valor: saque.valor,
            p_data_pagamento: saque.dataPagamento,
            p_origem: "divipay_externo",
            p_referencia: saque.externalId,
            p_observacoes: "Identificação automática de Pix Divipay",
          });

          if (errManual) {
            logger.error(COMPONENT, "Falha ao registrar pagamento manual do colaborador", { error: errManual });
            await this.registrarConciliacao(userId, wsId, saque, "pendente", {
              beneficiarioTipo: match.tipo,
              colaboradorId: match.colaborador.id,
              motivoRevisao: `Beneficiário identificado, mas falha ao registrar pagamento: ${errManual.message ?? String(errManual)}`,
              metodoPagamento: "pix",
              origemEvidencia: match.evidencia,
            });
            resumo.processados++;
            resumo.pendentes++;
            continue;
          }

          await criarDespesaTaxa(userId, saque, wsId);
          await this.registrarConciliacao(userId, wsId, saque, "conciliada", {
            beneficiarioTipo: match.tipo,
            colaboradorId: match.colaborador.id,
            acertoId: resManual?.acerto_id ?? null,
            despesaId: resManual?.despesa_id ?? null,
            metodoPagamento: "pix",
            origemEvidencia: match.evidencia,
          });
        }

        resumo.processados++;
        resumo.conciliadasAuto++;
        continue;
      }

      // CASO B: Identificado como Fornecedor (Pix ou Boleto)
      if (match.tipo === "fornecedor") {
        if (match.dividaSugerida) {
          const ok = await baixarDivida(userId, match.dividaSugerida.id, saque);
          if (!ok) {
            logger.error(COMPONENT, "Falha ao processar baixa contábil da dívida", { dividaId: match.dividaSugerida.id });
            await this.registrarConciliacao(userId, wsId, saque, "pendente", {
              beneficiarioTipo: "fornecedor",
              contatoId: match.fornecedor.id,
              dividaSugeridaId: match.dividaSugerida.id,
              motivoRevisao: "Beneficiário identificado, mas falha ao processar baixa contábil da dívida",
              categoriaId: match.categoriaIdSugerida,
              subcategoriaId: match.subcategoriaIdSugerida,
              metodoPagamento: match.metodoPagamento,
              origemEvidencia: match.evidencia,
            });
            resumo.processados++;
            resumo.pendentes++;
            continue;
          }
          match.dividaSugerida.valor_restante = Math.max(0, match.dividaSugerida.valor_restante - saque.valor);
          const despesaId = await criarDespesaFornecedor(
            userId,
            saque,
            match.fornecedor,
            match.categoriaIdSugerida,
            match.subcategoriaIdSugerida,
            match.metodoPagamento,
            wsId,
          );
          await criarDespesaTaxa(userId, saque, wsId);
          await this.registrarConciliacao(userId, wsId, saque, "conciliada", {
            beneficiarioTipo: "fornecedor",
            contatoId: match.fornecedor.id,
            dividaId: match.dividaSugerida.id,
            despesaId: despesaId ?? undefined,
            categoriaId: match.categoriaIdSugerida,
            subcategoriaId: match.subcategoriaIdSugerida,
            metodoPagamento: match.metodoPagamento,
            origemEvidencia: match.evidencia,
          });
        } else {
          const despesaId = await criarDespesaFornecedor(
            userId,
            saque,
            match.fornecedor,
            match.categoriaIdSugerida,
            match.subcategoriaIdSugerida,
            match.metodoPagamento,
            wsId,
          );
          if (!despesaId) {
            logger.error(COMPONENT, "Falha ao criar despesa para fornecedor", { fornecedorId: match.fornecedor.id });
            await this.registrarConciliacao(userId, wsId, saque, "pendente", {
              beneficiarioTipo: "fornecedor",
              contatoId: match.fornecedor.id,
              motivoRevisao: "Fornecedor identificado, mas falha ao criar despesa contábil",
              categoriaId: match.categoriaIdSugerida,
              subcategoriaId: match.subcategoriaIdSugerida,
              metodoPagamento: match.metodoPagamento,
              origemEvidencia: match.evidencia,
            });
            resumo.processados++;
            resumo.pendentes++;
            continue;
          }
          await criarDespesaTaxa(userId, saque, wsId);
          await this.registrarConciliacao(userId, wsId, saque, "conciliada", {
            beneficiarioTipo: "fornecedor",
            contatoId: match.fornecedor.id,
            despesaId,
            categoriaId: match.categoriaIdSugerida,
            subcategoriaId: match.subcategoriaIdSugerida,
            metodoPagamento: match.metodoPagamento,
            origemEvidencia: match.evidencia,
          });
        }

        resumo.processados++;
        resumo.conciliadasAuto++;
        continue;
      }

      // CASO C: Ambiguidade -> Fila de revisão (Pendente)
      if (match.tipo === "ambiguo") {
        await this.registrarConciliacao(userId, wsId, saque, "pendente", {
          motivoRevisao: match.motivo,
        });
        resumo.processados++;
        resumo.pendentes++;
        continue;
      }

      // CASO D: Não identificado
      if (match.dividaAparente) {
        await this.registrarConciliacao(userId, wsId, saque, "pendente", {
          dividaSugeridaId: match.dividaAparente.id,
          motivoRevisao: match.motivo,
        });
        resumo.processados++;
        resumo.pendentes++;
      } else {
        const despesaId = await criarDespesaAvulsa(userId, saque, wsId);
        await criarDespesaTaxa(userId, saque, wsId);
        await this.registrarConciliacao(userId, wsId, saque, "importada", {
          despesaId,
          motivoRevisao: match.motivo,
        });
        resumo.processados++;
        resumo.avulsas++;
      }
    }

    logger.info(COMPONENT, "Conciliação concluída", { ...resumo });
    return resumo;
  }

  async registrarConciliacao(
    userId: string,
    workspaceId: string,
    saque: SaqueParaConciliar,
    status: "pendente" | "conciliada" | "importada" | "ignorada",
    extra: {
      dividaId?: string | null;
      dividaSugeridaId?: string | null;
      despesaId?: string | null;
      contatoId?: string | null;
      colaboradorId?: string | null;
      acertoId?: string | null;
      categoriaId?: string | null;
      subcategoriaId?: string | null;
      metodoPagamento?: "pix" | "boleto" | "cartao" | "ted" | "outro" | string | null;
      beneficiarioTipo?: "fornecedor" | "colaborador" | "socio" | "outro" | null;
      origemEvidencia?: string | null;
      competencia?: string | null;
      motivoRevisao?: string | null;
    } = {},
  ): Promise<void> {
    const wsId = requireWorkspaceId(workspaceId);
    if (!userId || typeof userId !== "string" || !userId.trim()) {
      throw new Error("user_id é obrigatório para registrar conciliação (fail-closed)");
    }

    const { error } = await dynamicDb.from("divipay_conciliacoes").upsert(
      {
        user_id: userId,
        workspace_id: wsId,
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
        contato_id: extra.contatoId ?? null,
        colaborador_id: extra.colaboradorId ?? null,
        acerto_id: extra.acertoId ?? null,
        categoria_id: extra.categoriaId ?? null,
        subcategoria_id: extra.subcategoriaId ?? null,
        metodo_pagamento: extra.metodoPagamento ?? null,
        beneficiario_tipo: extra.beneficiarioTipo ?? null,
        origem_evidencia: extra.origemEvidencia ?? null,
        competencia: extra.competencia ?? saque.dataPagamento.slice(0, 7),
        motivo_revisao: extra.motivoRevisao ?? null,
      },
      { onConflict: "user_id,divipay_external_id" },
    );
    if (error) {
      logger.error(COMPONENT, "Erro ao registrar conciliação", { error: error.message });
      throw error;
    }
  }

  async confirmar(conciliacao: DivipayConciliacao, dividaId: string, workspaceId?: string | null): Promise<boolean> {
    const wsId = requireWorkspaceId(workspaceId ?? conciliacao.workspace_id);
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
    await criarDespesaTaxa(userId, saque, wsId);

    const { error } = await dynamicDb
      .from("divipay_conciliacoes")
      .update({ status: "conciliada", divida_id: dividaId })
      .eq("id", conciliacao.id);
    return !error;
  }

  async vincularFornecedor(
    conciliacao: DivipayConciliacao,
    contatoId: string,
    categoriaId?: string | null,
    workspaceId?: string | null,
  ): Promise<boolean> {
    const wsId = requireWorkspaceId(workspaceId ?? conciliacao.workspace_id);
    const userId = await requireUserId();

    const { data: contato } = await dynamicDb
      .from("contatos")
      .select("*")
      .eq("id", contatoId)
      .eq("workspace_id", wsId)
      .single();

    if (!contato) throw new Error("Fornecedor não encontrado");

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

    const rawTipo = String(conciliacao.tipo || "").toUpperCase();
    const isBoleto = rawTipo === "BILLET" || rawTipo === "BOLETO";
    const metodo: "pix" | "boleto" = isBoleto ? "boleto" : "pix";

    const despesaId = await criarDespesaFornecedor(
      userId,
      saque,
      contato,
      categoriaId || contato.categoria_padrao_id,
      contato.subcategoria_padrao_id,
      metodo,
      wsId,
    );

    if (!despesaId) {
      throw new Error("Falha ao registrar despesa contábil do fornecedor");
    }

    await criarDespesaTaxa(userId, saque, wsId);

    const { error } = await dynamicDb
      .from("divipay_conciliacoes")
      .update({
        status: "conciliada",
        beneficiario_tipo: "fornecedor",
        contato_id: contatoId,
        categoria_id: categoriaId || contato.categoria_padrao_id,
        subcategoria_id: contato.subcategoria_padrao_id,
        metodo_pagamento: metodo,
        despesa_id: despesaId,
        origem_evidencia: "manual_usuario",
        revisado_por: userId,
        revisado_em: new Date().toISOString(),
      })
      .eq("id", conciliacao.id);

    return !error;
  }

  async vincularColaborador(
    conciliacao: DivipayConciliacao,
    colaboradorId: string,
    acertoId?: string | null,
    workspaceId?: string | null,
  ): Promise<boolean> {
    const wsId = requireWorkspaceId(workspaceId ?? conciliacao.workspace_id);
    const userId = await requireUserId();

    const { data: colab } = await dynamicDb
      .from("colaboradores")
      .select("*")
      .eq("id", colaboradorId)
      .eq("workspace_id", wsId)
      .single();

    if (!colab) throw new Error("Colaborador não encontrado");

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

    let targetAcertoId = acertoId;
    let targetDespesaId = conciliacao.despesa_id;

    if (targetAcertoId) {
      const { error: rpcErr } = await dynamicDb.rpc("confirmar_pagamento_acerto", {
        p_acerto_id: targetAcertoId,
        p_divipay_external_id: saque.externalId,
        p_pagamento_id: null,
        p_origem: "divipay_externo",
        p_valor: saque.valor,
        p_taxa: saque.taxa,
        p_comprovante_url: null,
      });
      if (rpcErr) throw rpcErr;
    } else {
      const { data: resRpc, error: errRpc } = await dynamicDb.rpc("registrar_pagamento_colaborador_manual", {
        p_colaborador_id: colaboradorId,
        p_tipo: "outro",
        p_periodo_inicio: saque.dataPagamento.slice(0, 10),
        p_periodo_fim: saque.dataPagamento.slice(0, 10),
        p_valor: saque.valor,
        p_data_pagamento: saque.dataPagamento,
        p_origem: "divipay_externo",
        p_referencia: saque.externalId,
        p_observacoes: "Conciliação manual com Pix Divipay",
      });
      if (errRpc) throw errRpc;
      targetAcertoId = resRpc?.acerto_id ?? null;
      targetDespesaId = resRpc?.despesa_id ?? targetDespesaId;
    }

    await criarDespesaTaxa(userId, saque, wsId);

    const { error } = await dynamicDb
      .from("divipay_conciliacoes")
      .update({
        status: "conciliada",
        beneficiario_tipo: colab.tipo === "socio" ? "socio" : "colaborador",
        colaborador_id: colaboradorId,
        acerto_id: targetAcertoId,
        despesa_id: targetDespesaId,
        metodo_pagamento: "pix",
        origem_evidencia: "manual_usuario",
        revisado_por: userId,
        revisado_em: new Date().toISOString(),
      })
      .eq("id", conciliacao.id);

    return !error;
  }

  async importarAvulsa(conciliacao: DivipayConciliacao, workspaceId?: string | null): Promise<boolean> {
    const wsId = requireWorkspaceId(workspaceId ?? conciliacao.workspace_id);
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

    const despesaId = await criarDespesaAvulsa(userId, saque, wsId);
    await criarDespesaTaxa(userId, saque, wsId);

    const { error } = await dynamicDb
      .from("divipay_conciliacoes")
      .update({ status: "importada", despesa_id: despesaId })
      .eq("id", conciliacao.id);
    return !error;
  }

  async ignorar(conciliacaoId: string): Promise<boolean> {
    const { error } = await dynamicDb
      .from("divipay_conciliacoes")
      .update({ status: "ignorada" })
      .eq("id", conciliacaoId);
    return !error;
  }

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
