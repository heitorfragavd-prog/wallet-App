import { getSupabaseSecretKey } from "../_shared/supabase-keys.ts";
// Edge Function: recepção de webhooks da Divipay
// URL: https://[seu-projeto].supabase.co/functions/v1/divipay-webhook?token=<DIVIPAY_WEBHOOK_SECRET>
//
// Fluxo (integração híbrida com o módulo financeiro):
// - Pix PAID (CASH_IN): marca transação como PAID, cria Receita (valor bruto)
//   e Despesa com a taxa Divipay (categoria "Taxas Bancárias / Tarifas de Gateway").
// - Saque concluído (CASH_OUT): marca como PAID e cria Despesa no financeiro.
// - Idempotente: transação já PAID é ignorada sem duplicar lançamentos.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { validateWebhookSecret } from '../_shared/auth-guard.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function mapStatus(status: unknown): 'PENDING' | 'PAID' | 'FAILED' | 'CANCELED' | null {
  const s = String(status ?? '').toUpperCase()
  if (['PAID', 'APPROVED', 'FINISHED', 'CONFIRMED', 'COMPLETED'].includes(s)) return 'PAID'
  if (['CANCELED', 'CANCELLED', 'EXPIRED', 'REFUNDED'].includes(s)) return 'CANCELED'
  if (['FAILED', 'ERROR', 'REJECTED'].includes(s)) return 'FAILED'
  if (['PENDING', 'PROCESSING', 'WAITING'].includes(s)) return 'PENDING'
  return null
}

// Extrai campos do payload da Divipay tolerando variações de formato
function extractFields(payload: any) {
  const tx = payload?.transaction ?? payload?.charge ?? payload?.data ?? payload
  return {
    event: payload?.event ?? payload?.eventType ?? payload?.type ?? null,
    externalId: tx?.transaction_id ?? tx?.transactionId ?? tx?.chargeId ?? tx?.id ?? payload?.referenceId ?? null,
    status: tx?.status ?? payload?.status ?? null,
    amount: Number(tx?.amount ?? tx?.value ?? 0) || null,
    fee: Number(tx?.taxes ?? tx?.fee ?? tx?.taxa ?? 0) || null,
  }
}

// Busca ou cria a conta "Divipay" do usuário em contas_usuario
async function findOrCreateConta(supabaseAdmin: any, userId: string): Promise<string | null> {
  const { data: conta } = await supabaseAdmin
    .from('contas_usuario')
    .select('id')
    .eq('user_id', userId)
    .eq('nome', 'Divipay')
    .maybeSingle()

  if (conta) return conta.id

  const { data: nova, error } = await supabaseAdmin
    .from('contas_usuario')
    .insert({ user_id: userId, nome: 'Divipay', tipo: 'carteira' })
    .select('id')
    .single()

  if (error) {
    console.error('Erro ao criar conta Divipay:', error)
    return null
  }
  return nova.id
}

// Busca ou cria categoria por nome/tipo para o usuário
async function findOrCreateCategoria(
  supabaseAdmin: any,
  userId: string,
  nome: string,
  tipo: 'receita' | 'despesa',
  icone: string,
  cor: string,
): Promise<string | null> {
  const { data: categoria } = await supabaseAdmin
    .from('categorias')
    .select('id')
    .eq('user_id', userId)
    .eq('nome', nome)
    .eq('tipo', tipo)
    .maybeSingle()

  if (categoria) return categoria.id

  const { data: nova, error } = await supabaseAdmin
    .from('categorias')
    .insert({ user_id: userId, nome, tipo, icone, cor })
    .select('id')
    .single()

  if (error) {
    console.error(`Erro ao criar categoria ${nome}:`, error)
    return null
  }
  return nova.id
}

// Workspace default do usuário (fallback quando o lançamento não vem de uma dívida)
async function findDefaultWorkspace(supabaseAdmin: any, userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('workspaces')
    .select('id')
    .eq('user_id', userId)
    .eq('is_default', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

function normalizarDocumento(doc: string | null | undefined): string {
  if (!doc) return "";
  const digits = doc.replace(/\D/g, "");
  if (/[a-zA-Z]/.test(doc)) return doc.trim().toLowerCase();
  return digits;
}

function normalizarNome(nome: string | null | undefined): string {
  return (nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nomesParecidos(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizarNome(a);
  const nb = normalizarNome(b);
  if (!na || !nb) return false;
  if (na.length >= 4 && nb.includes(na)) return true;
  if (nb.length >= 4 && na.includes(nb)) return true;

  const tokensA = new Set(na.split(" ").filter((t) => t.length >= 3));
  const tokensB = new Set(nb.split(" ").filter((t) => t.length >= 3));
  if (tokensA.size === 0 || tokensB.size === 0) return false;
  let comuns = 0;
  for (const t of tokensA) if (tokensB.has(t)) comuns++;
  const menor = Math.min(tokensA.size, tokensB.size);
  return comuns / menor >= 0.6;
}

function diasEntre(a: string, b: string): number {
  const da = new Date(a.length === 10 ? `${a}T12:00:00` : a);
  const db = new Date(b.length === 10 ? `${b}T12:00:00` : b);
  return Math.abs(da.getTime() - db.getTime()) / 86_400_000;
}

function valorBate(valorDivida: number, valorSaque: number): boolean {
  return Math.abs(valorDivida - valorSaque) <= 1.0;
}

const BANCOS_INTERMEDIARIOS = new Set([
  "60701190000104", // Itaú
  "00000000000191", // Banco do Brasil
  "00360305000104", // Caixa
  "90400888000142", // Santander
  "07237373000120", // Bradesco
  "61088183000109", // Safra
  "13079034000142", // Stone
  "10573521000191", // Mercado Pago
  "18236120000158", // Nubank
  "33885724000119", // PagBank
  "30306294000145", // BTG Pactual
  "04913711000108", // Banco Inter
  "28018868000130", // PicPay
]);

function normalizarChavePix(chave: string | null | undefined): string {
  if (!chave) return "";
  const limpa = chave.trim().toLowerCase();
  const digits = limpa.replace(/\D/g, "");
  if (/^\+?55\d{10,11}$/.test(limpa)) return limpa.replace(/^\+55/, "").replace(/\D/g, "");
  if (digits.length === 11 || digits.length === 14) return digits;
  return limpa;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let webhookLogId: string | null = null

  try {
    // 1. Valida o token do webhook (Fail-Closed e Tempo Constante)
    const url = new URL(req.url)
    const token = url.searchParams.get('token') || req.headers.get('x-webhook-token')
    const secret = Deno.env.get('DIVIPAY_WEBHOOK_SECRET')

    if (!validateWebhookSecret(token, secret)) {
      console.error('Webhook Divipay: token inválido ou ausente (Fail-Closed)')
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      getSupabaseSecretKey(),
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const payload = await req.json()
    const { event, externalId, status, fee } = extractFields(payload)

    console.log('Webhook Divipay recebido:', { event, externalId, status })

    // 2. Registra o log do webhook
    const { data: logData, error: logError } = await supabaseAdmin
      .from('divipay_webhook_logs')
      .insert({ event_type: event, external_id: externalId, payload })
      .select('id')
      .single()

    if (logError) {
      console.error('Erro ao registrar log do webhook:', logError)
    }
    webhookLogId = logData?.id ?? null

    const markLog = async (processed: boolean, errorMessage?: string) => {
      if (!webhookLogId) return
      await supabaseAdmin
        .from('divipay_webhook_logs')
        .update({ processed, error_message: errorMessage ?? null })
        .eq('id', webhookLogId)
    }

    if (!externalId) {
      await markLog(false, 'Payload sem identificador da transação')
      return jsonResponse({ success: true, message: 'Payload ignorado: sem external_id' })
    }

    // 3. Localiza a transação local
    const { data: transacao } = await supabaseAdmin
      .from('divipay_transacoes')
      .select('*')
      .eq('external_id', externalId)
      .maybeSingle()

    if (!transacao) {
      await markLog(false, 'Transação não encontrada')
      return jsonResponse({ success: true, message: 'Transação não encontrada; ignorando' })
    }

    // Vincula o log ao usuário dono da transação
    if (webhookLogId) {
      await supabaseAdmin
        .from('divipay_webhook_logs')
        .update({ user_id: transacao.user_id })
        .eq('id', webhookLogId)
    }

    // 4. Idempotência e Auto-recuperação Financeira:
    // Se a transação já está PAID mas NÃO possui receita vinculada nos metadados (devido a falha intermediária anterior),
    // NÃO aborta! Permite auto-recuperação financeira integral dos lançamentos.
    const isAlreadyPaid = transacao.status === 'PAID';
    if (isAlreadyPaid) {
      const hasReceitaId = Boolean(transacao.metadata?.receita_id);
      if (hasReceitaId) {
        await markLog(true)
        return jsonResponse({ success: true, message: 'Transação já processada anteriormente' })
      } else {
        console.warn(`[divipay-webhook] Transação ${externalId} com status PAID sem receita_id vinculada. Iniciando auto-recuperação financeira...`)
      }
    }

    const newStatus = isAlreadyPaid ? 'PAID' : mapStatus(status ?? event)
    if (!newStatus || newStatus === 'PENDING') {
      await markLog(true, 'Evento sem mudança de status relevante')
      return jsonResponse({ success: true, message: 'Evento ignorado (status sem alteração)' })
    }

    // 5. Atualização atômica do status da transação com proteção contra concorrência
    const effectiveFee = fee ?? transacao.fee ?? null
    if (newStatus === 'PAID' && !isAlreadyPaid) {
      const { data: updatedTx } = await supabaseAdmin
        .from('divipay_transacoes')
        .update({ status: 'PAID', fee: effectiveFee, updated_at: new Date().toISOString() })
        .eq('id', transacao.id)
        .neq('status', 'PAID')
        .select('id')
        .maybeSingle()

      if (!updatedTx) {
        console.log(`[divipay-webhook] Transação ${externalId} já concluída concorrentemente (idempotente).`)
        await markLog(true, 'Transação já processada concorrentemente')
        return jsonResponse({ success: true, message: 'Transação já processada anteriormente' })
      }
    } else if (!isAlreadyPaid) {
      await supabaseAdmin
        .from('divipay_transacoes')
        .update({ status: newStatus, fee: effectiveFee, updated_at: new Date().toISOString() })
        .eq('id', transacao.id)
    }

    // 6. Integração financeira apenas para confirmações (PAID)
    if (newStatus === 'PAID') {
      const userId = transacao.user_id
      const hoje = new Date().toISOString().slice(0, 10)
      const contaId = await findOrCreateConta(supabaseAdmin, userId)
      const defaultWorkspaceId = await findDefaultWorkspace(supabaseAdmin, userId)
      const metadata: Record<string, unknown> = { ...(transacao.metadata ?? {}) }

      if (transacao.type === 'CASH_IN') {
        const cashInWorkspaceId = transacao.workspace_id ?? defaultWorkspaceId
        // Receita com o valor bruto
        const categoriaReceitaId = await findOrCreateCategoria(
          supabaseAdmin, userId, 'Recebimentos Divipay', 'receita', 'Landmark', '#22c55e',
        )
        const categoriaTaxaId = effectiveFee && Number(effectiveFee) > 0 ? await findOrCreateCategoria(
          supabaseAdmin, userId, 'Taxas Bancárias / Tarifas de Gateway', 'despesa', 'Percent', '#ef4444',
        ) : null

        // Tentar processamento atômico transacional via RPC no PostgreSQL
        let processedViaRpc = false
        try {
          const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('processar_divipay_cashin_atomico', {
            p_transacao_id: transacao.id,
            p_external_id: externalId,
            p_user_id: userId,
            p_workspace_id: cashInWorkspaceId,
            p_amount: transacao.amount,
            p_fee: effectiveFee ? Number(effectiveFee) : 0,
            p_conta_id: contaId,
            p_categoria_receita_id: categoriaReceitaId,
            p_categoria_taxa_id: categoriaTaxaId,
            p_descricao: transacao.description ?? `Recebimento Pix Divipay ${externalId}`,
            p_data: hoje,
          })

          if (!rpcErr && rpcRes?.success) {
            processedViaRpc = true
            metadata.receita_id = rpcRes.receita_id
            metadata.despesa_taxa_id = rpcRes.despesa_taxa_id
            if (rpcRes.already_processed) {
              await markLog(true, 'Transação já processada e reconciliada via RPC atômica')
              return jsonResponse({ success: true, message: 'Transação já processada anteriormente' })
            }
          } else if (rpcErr) {
            // Falha controlada: se a RPC existe mas retornou erro de negócio ou banco,
            // NÃO cair no fallback não-atômico. Falha de forma controlada para permitir recuperação segura.
            const isMissingFunction = rpcErr.code === 'PGRST202' || rpcErr.code === '42883' || rpcErr.message?.includes('function') || rpcErr.message?.includes('not found');
            if (!isMissingFunction) {
              console.error('[divipay-webhook] Falha controlada na RPC atômica:', rpcErr);
              await markLog(false, `Falha controlada na RPC atômica: ${rpcErr.message}`);
              throw new Error(`Falha atômica ao processar cash-in Divipay: ${rpcErr.message}`);
            }
            console.warn('[divipay-webhook] RPC atômica não instalada no banco (PGRST202). Executando fallback legado...');
          }
        } catch (rpcEx) {
          if (rpcEx instanceof Error && rpcEx.message.includes('Falha atômica')) {
            throw rpcEx;
          }
          console.warn('[divipay-webhook] RPC atômica indisponível, executando fallback defensivo com deduplication_key:', rpcEx)
        }

        if (!processedViaRpc) {
          // Fallback defensivo com deduplication_key única no PostgreSQL
          const { data: receita, error: receitaError } = await supabaseAdmin
            .from('receitas')
            .insert({
              user_id: userId,
              categoria_id: categoriaReceitaId,
              conta_id: contaId,
              workspace_id: cashInWorkspaceId,
              descricao: transacao.description ?? `Recebimento Pix Divipay ${externalId}`,
              valor: transacao.amount,
              data: hoje,
              metodo_pagamento: 'pix',
              status: 'recebido',
              deduplication_key: `divipay:cashin:${transacao.id}`,
            })
            .select('id')
            .single()

          if (receitaError) {
            console.error('Erro ao criar receita no fallback:', receitaError)
          } else {
            metadata.receita_id = receita.id
          }

          // Despesa com a taxa do gateway
          if (effectiveFee && Number(effectiveFee) > 0 && categoriaTaxaId) {
            const { data: despesaTaxa, error: taxaError } = await supabaseAdmin
              .from('despesas')
              .insert({
                user_id: userId,
                categoria_id: categoriaTaxaId,
                conta_id: contaId,
                workspace_id: cashInWorkspaceId,
                descricao: `Taxa Divipay - transação ${externalId}`,
                valor: Number(effectiveFee),
                data: hoje,
                metodo_pagamento: 'pix',
                status: 'pago',
                deduplication_key: `divipay:fee:${transacao.id}`,
              })
              .select('id')
              .single()

            if (taxaError) {
              console.error('Erro ao criar despesa de taxa no fallback:', taxaError)
            } else {
              metadata.despesa_taxa_id = despesaTaxa.id
            }
          }
        }
      } else if (transacao.type === 'CASH_OUT') {
        const targetWorkspaceId = transacao.workspace_id ?? null
        if (!targetWorkspaceId) {
          console.error('Transação CASH_OUT sem workspace_id vinculado; abortando conciliação (fail-closed):', externalId)
          await markLog(false, 'Transação sem workspace_id vinculado (fail-closed)')
          return jsonResponse({ success: true, message: 'Conciliação abortada: transação sem workspace_id vinculado (fail-closed)' })
        }
        const dividaId = typeof metadata.divida_id === 'string' ? metadata.divida_id : null
        let dividaWorkspaceId: string | null = null

        if (dividaId) {
          // ── Baixa direta na dívida (pagamento iniciado pelo botão "Pagar via Divipay")
          // O trigger sync_pagamento_divida_to_despesa cria a despesa automaticamente.
          const { data: divida } = await supabaseAdmin
            .from('dividas')
            .select('*')
            .eq('id', dividaId)
            .maybeSingle()

          if (divida) {
            dividaWorkspaceId = divida.workspace_id ?? null
            const valorBaixa = Math.min(Number(transacao.amount), Number(divida.valor_restante))

            if (valorBaixa > 0) {
              const { error: pagError } = await supabaseAdmin
                .from('pagamentos_dividas')
                .insert({
                  divida_id: dividaId,
                  user_id: userId,
                  valor: valorBaixa,
                  data_pagamento: hoje,
                  metodo_pagamento: 'pix',
                  conta_id: contaId,
                  observacoes: `Pago via Divipay (Pix) - ${externalId}`,
                  divipay_external_id: externalId,
                })

              // 23505 = unique violation em divipay_external_id → baixa já feita (idempotente)
              if (pagError && pagError.code !== '23505') {
                console.error('Erro ao registrar pagamento da dívida:', pagError)
              } else if (!pagError) {
                const novoValorPago = Number(divida.valor_pago) + valorBaixa
                const novasParcelasPagas = Math.min(Number(divida.parcelas_pagas) + 1, Number(divida.parcelas))
                const todasPagas = novasParcelasPagas >= Number(divida.parcelas)
                const novoValorRestante = todasPagas
                  ? 0
                  : Math.max(0, Number(divida.valor_total) - novoValorPago)
                const novoStatus = todasPagas
                  ? 'quitada'
                  : new Date(divida.data_vencimento) < new Date()
                    ? 'vencida'
                    : 'pendente'

                let novaDataVencimento = divida.data_vencimento
                if (!todasPagas) {
                  const venc = new Date(`${divida.data_vencimento}T00:00:00`)
                  venc.setMonth(venc.getMonth() + 1)
                  novaDataVencimento = venc.toISOString().split('T')[0]
                }

                await supabaseAdmin
                  .from('dividas')
                  .update({
                    valor_pago: novoValorPago,
                    valor_restante: novoValorRestante,
                    parcelas_pagas: novasParcelasPagas,
                    data_vencimento: novaDataVencimento,
                    status: novoStatus,
                  })
                  .eq('id', dividaId)
              }
            }
            metadata.divida_baixada = true
          } else {
            console.error('Dívida da metadata não encontrada:', dividaId)
          }
        } else {
          // ── Motor de 3 camadas para CASH_OUT sem divida_id
          const saqueFavorecidoNome = (typeof metadata.payerName === "string" && metadata.payerName) || transacao.recipient_key || null
          const saqueFavorecidoDocumento = typeof metadata.document === "string" ? metadata.document : null
          const saqueValor = Number(transacao.amount || 0)
          const saqueData = transacao.created_at || hoje

          // Busca dívidas em aberto no mesmo workspace da transação
          const { data: dividas } = await supabaseAdmin
            .from('dividas')
            .select('id, descricao, credor, documento_favorecido, valor_restante, data_vencimento, workspace_id')
            .eq('user_id', userId)
            .eq('workspace_id', targetWorkspaceId)
            .neq('status', 'quitada')
            .gt('valor_restante', 0)

          const openDebts = (dividas ?? []).map((d: any) => ({
            id: d.id,
            descricao: d.descricao,
            credor: d.credor,
            documento_favorecido: d.documento_favorecido,
            valor_restante: Number(d.valor_restante),
            data_vencimento: d.data_vencimento,
            workspace_id: d.workspace_id,
          }))

          // Filtro inicial por valor e vencimento (janela de 45 dias)
          const candidatas = openDebts
            .filter((d) => valorBate(d.valor_restante, saqueValor))
            .filter((d) => diasEntre(d.data_vencimento, saqueData) <= 45)

          let matchResult: 
            | { camada: "auto"; divida: any }
            | { camada: "pendente"; dividaSugerida: any }
            | { camada: "avulsa" } = { camada: "avulsa" }

          if (candidatas.length > 0) {
            const docSaque = normalizarDocumento(saqueFavorecidoDocumento)

            // 1. auto: match exato por documento
            if (docSaque.length >= 6) {
              const porDocumento = candidatas.filter((d) => {
                const docDivida = normalizarDocumento(d.documento_favorecido)
                return docDivida.length >= 6 && docDivida === docSaque
              })
              if (porDocumento.length > 0) {
                porDocumento.sort((a, b) => Math.abs(a.valor_restante - saqueValor) - Math.abs(b.valor_restante - saqueValor))
                matchResult = { camada: "auto", divida: porDocumento[0] }
              }
            }

            if (matchResult.camada === "avulsa") {
              // Exclui dívidas com documento divergente
              const semConflitoDoc = candidatas.filter((d) => {
                const docDivida = normalizarDocumento(d.documento_favorecido)
                if (docDivida.length >= 6 && docSaque.length >= 6) return docDivida === docSaque
                return true // dívida sem documento: segue para análise de nome
              })

              if (semConflitoDoc.length > 0) {
                // 2. pendente: valor bate, sugere a mais provável para confirmação manual
                const porNome = semConflitoDoc.filter((d) => nomesParecidos(d.credor, saqueFavorecidoNome))
                const pool = porNome.length > 0 ? porNome : semConflitoDoc
                pool.sort((a, b) => Math.abs(a.valor_restante - saqueValor) - Math.abs(b.valor_restante - saqueValor))
                matchResult = { camada: "pendente", dividaSugerida: pool[0] ?? null }
              }
            }
          }

          if (matchResult.camada === "auto") {
            const matchedDivida = matchResult.divida
            dividaWorkspaceId = matchedDivida.workspace_id ?? null
            const valorBaixa = Math.min(saqueValor, Number(matchedDivida.valor_restante))

            if (valorBaixa > 0) {
              const { error: pagError } = await supabaseAdmin
                .from('pagamentos_dividas')
                .insert({
                  divida_id: matchedDivida.id,
                  user_id: userId,
                  valor: valorBaixa,
                  data_pagamento: saqueData.slice(0, 10),
                  metodo_pagamento: 'pix',
                  conta_id: contaId,
                  observacoes: `Pago via Divipay (Pix Auto-Match) - ${externalId}`,
                  divipay_external_id: externalId,
                })

              if (pagError && pagError.code !== '23505') {
                console.error('Erro ao registrar pagamento da dívida:', pagError)
              } else if (!pagError) {
                // Get current debt to update accurately
                const { data: dividaFresh } = await supabaseAdmin
                  .from('dividas')
                  .select('*')
                  .eq('id', matchedDivida.id)
                  .single()

                if (dividaFresh) {
                  const novoValorPago = Number(dividaFresh.valor_pago) + valorBaixa
                  const novasParcelasPagas = Math.min(Number(dividaFresh.parcelas_pagas) + 1, Number(dividaFresh.parcelas))
                  const todasPagas = novasParcelasPagas >= Number(dividaFresh.parcelas)
                  const novoValorRestante = todasPagas
                    ? 0
                    : Math.max(0, Number(dividaFresh.valor_total) - novoValorPago)
                  const novoStatus = todasPagas
                    ? 'quitada'
                    : new Date(dividaFresh.data_vencimento) < new Date()
                      ? 'vencida'
                      : 'pendente'

                  let novaDataVencimento = dividaFresh.data_vencimento
                  if (!todasPagas) {
                    const venc = new Date(`${dividaFresh.data_vencimento}T00:00:00`)
                    venc.setMonth(venc.getMonth() + 1)
                    novaDataVencimento = venc.toISOString().split('T')[0]
                  }

                  await supabaseAdmin
                    .from('dividas')
                    .update({
                      valor_pago: novoValorPago,
                      valor_restante: novoValorRestante,
                      parcelas_pagas: novasParcelasPagas,
                      data_vencimento: novaDataVencimento,
                      status: novoStatus,
                    })
                    .eq('id', matchedDivida.id)
                }
              }
            }

            // Registrar conciliação como conciliada
            const metaType = metadata.paymentType
            await supabaseAdmin.from('divipay_conciliacoes').upsert(
              {
                user_id: userId,
                workspace_id: targetWorkspaceId,
                divipay_external_id: externalId,
                tipo: typeof metaType === 'string' ? metaType : null,
                favorecido_nome: saqueFavorecidoNome,
                favorecido_documento: saqueFavorecidoDocumento,
                valor: saqueValor,
                taxa: effectiveFee ?? 0,
                data_pagamento: transacao.created_at,
                descricao: transacao.description,
                status: 'conciliada',
                divida_id: matchedDivida.id,
                divida_sugerida_id: null,
                despesa_id: null,
              },
              { onConflict: 'user_id,divipay_external_id' }
            )

            metadata.divida_id = matchedDivida.id
            metadata.divida_baixada = true
          } else if (matchResult.camada === "pendente") {
            const suggestedDivida = matchResult.dividaSugerida
            dividaWorkspaceId = suggestedDivida?.workspace_id ?? null

            // Registrar conciliação como pendente
            const metaType = metadata.paymentType
            await supabaseAdmin.from('divipay_conciliacoes').upsert(
              {
                user_id: userId,
                workspace_id: targetWorkspaceId,
                divipay_external_id: externalId,
                tipo: typeof metaType === 'string' ? metaType : null,
                favorecido_nome: saqueFavorecidoNome,
                favorecido_documento: saqueFavorecidoDocumento,
                valor: saqueValor,
                taxa: effectiveFee ?? 0,
                data_pagamento: transacao.created_at,
                descricao: transacao.description,
                status: 'pendente',
                divida_id: null,
                divida_sugerida_id: suggestedDivida?.id ?? null,
                despesa_id: null,
              },
              { onConflict: 'user_id,divipay_external_id' }
            )

            metadata.divida_sugerida_id = suggestedDivida?.id ?? null
            metadata.conciliacao_status = 'pendente'
            // NENHUMA despesa avulsa é criada aqui para aguardar a decisão do usuário em /conciliacao
          } else {
            // ── Identificação Avançada: Colaboradores e Fornecedores
            const isBoleto = String(metadata.paymentType || '').toUpperCase() === 'BILLET' || 
                             String(transacao.recipient_key || '').length > 35;
            const docSaqueNormalizado = normalizarDocumento(saqueFavorecidoDocumento);
            const pixChaveSaque = normalizarChavePix(transacao.recipient_key);

            let identificadoColaborador: any = null;
            let identificadoContato: any = null;

            // 1. Identificação de Colaborador (Pix ou Documento)
            const { data: colabs } = await supabaseAdmin
              .from('colaboradores')
              .select('id, nome, tipo, pix_chave, pix_chave_normalizada, cpf, workspace_id')
              .eq('workspace_id', targetWorkspaceId)
              .eq('status', 'ativo');

            if (colabs && colabs.length > 0) {
              identificadoColaborador = colabs.find((c: any) => {
                if (pixChaveSaque && (
                  normalizarChavePix(c.pix_chave_normalizada) === pixChaveSaque ||
                  normalizarChavePix(c.pix_chave) === pixChaveSaque
                )) {
                  return true;
                }
                if (docSaqueNormalizado.length >= 11 && (
                  normalizarDocumento(c.documento_normalizado) === docSaqueNormalizado ||
                  normalizarDocumento(c.cpf) === docSaqueNormalizado
                )) {
                  return true;
                }
                return false;
              });
            }

            // 2. Se não for colaborador, buscar em Fornecedores (contatos)
            if (!identificadoColaborador) {
              const { data: contatos } = await supabaseAdmin
                .from('contatos')
                .select('id, nome, nome_fantasia, tipo, categoria_padrao_id, subcategoria_padrao_id, pix_chave, pix_chave_normalizada, beneficiario_documento, beneficiario_documento_normalizado, chaves_pix_adicionais, identificadores_boletos, workspace_id')
                .eq('workspace_id', targetWorkspaceId)
                .eq('tipo', 'fornecedor')
                .eq('ativo', true);

              if (contatos && contatos.length > 0) {
                identificadoContato = contatos.find((contato: any) => {
                  if (isBoleto) {
                    if (docSaqueNormalizado && BANCOS_INTERMEDIARIOS.has(docSaqueNormalizado)) {
                      return false; // Nunca atribuir banco intermediário
                    }
                    if (docSaqueNormalizado.length >= 11 && (
                      normalizarDocumento(contato.beneficiario_documento_normalizado) === docSaqueNormalizado ||
                      normalizarDocumento(contato.beneficiario_documento) === docSaqueNormalizado
                    )) {
                      return true;
                    }
                    const boletoIds = Array.isArray(contato.identificadores_boletos) ? contato.identificadores_boletos : [];
                    if (boletoIds.some((b: string) => normalizarDocumento(b) === docSaqueNormalizado)) {
                      return true;
                    }
                  } else {
                    if (pixChaveSaque && (
                      normalizarChavePix(contato.pix_chave_normalizada) === pixChaveSaque ||
                      normalizarChavePix(contato.pix_chave) === pixChaveSaque
                    )) {
                      return true;
                    }
                    const pixAdicionais = Array.isArray(contato.chaves_pix_adicionais) ? contato.chaves_pix_adicionais : [];
                    if (pixAdicionais.some((p: string) => normalizarChavePix(p) === pixChaveSaque)) {
                      return true;
                    }
                  }
                  return false;
                });
              }
            }

            if (identificadoColaborador) {
              // Buscar acerto de equipe pendente
              const { data: acertosPendentes } = await supabaseAdmin
                .from('colaborador_acertos')
                .select('id, valor_total, status, colaborador_id')
                .eq('colaborador_id', identificadoColaborador.id)
                .eq('workspace_id', targetWorkspaceId)
                .in('status', ['pendente', 'processando']);

              const acertoCompativel = (acertosPendentes ?? []).find(
                (a: any) => Math.abs(Number(a.valor_total) - saqueValor) <= 0.05
              );

              let targetAcertoId = acertoCompativel?.id ?? null;
              let targetDespesaId: string | null = null;

              if (targetAcertoId) {
                await supabaseAdmin.rpc('confirmar_pagamento_acerto', {
                  p_acerto_id: targetAcertoId,
                  p_divipay_external_id: externalId,
                  p_pagamento_id: null,
                  p_origem: 'divipay_externo',
                  p_valor: saqueValor,
                  p_taxa: effectiveFee ?? 0,
                  p_comprovante_url: null,
                });
              } else {
                const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('registrar_pagamento_colaborador_manual', {
                  p_colaborador_id: identificadoColaborador.id,
                  p_tipo: identificadoColaborador.tipo === 'socio' ? 'pro_labore' : 'outro',
                  p_periodo_inicio: saqueData.slice(0, 10),
                  p_periodo_fim: saqueData.slice(0, 10),
                  p_valor: saqueValor,
                  p_data_pagamento: saqueData,
                  p_origem: 'divipay_externo',
                  p_referencia: externalId,
                  p_observacoes: 'Conciliação automática via webhook Divipay',
                });
                if (!rpcErr && rpcRes) {
                  targetAcertoId = rpcRes.acerto_id ?? null;
                  targetDespesaId = rpcRes.despesa_id ?? null;
                }
              }

              const metaType = metadata.paymentType;
              await supabaseAdmin.from('divipay_conciliacoes').upsert(
                {
                  user_id: userId,
                  workspace_id: targetWorkspaceId,
                  divipay_external_id: externalId,
                  tipo: typeof metaType === 'string' ? metaType : (isBoleto ? 'BILLET' : 'DICT'),
                  favorecido_nome: saqueFavorecidoNome || identificadoColaborador.nome,
                  favorecido_documento: saqueFavorecidoDocumento || identificadoColaborador.cpf_cnpj,
                  valor: saqueValor,
                  taxa: effectiveFee ?? 0,
                  data_pagamento: transacao.created_at,
                  descricao: transacao.description,
                  status: 'conciliada',
                  beneficiario_tipo: identificadoColaborador.tipo === 'socio' ? 'socio' : 'colaborador',
                  colaborador_id: identificadoColaborador.id,
                  acerto_id: targetAcertoId,
                  despesa_id: targetDespesaId,
                  metodo_pagamento: 'pix',
                  origem_evidencia: 'webhook_identificacao_colaborador',
                },
                { onConflict: 'user_id,divipay_external_id' }
              );
              metadata.conciliacao_status = 'conciliada';
              metadata.colaborador_id = identificadoColaborador.id;
            } else if (identificadoContato) {
              const categoriaFornecedorId = identificadoContato.categoria_padrao_id || await findOrCreateCategoria(
                supabaseAdmin, userId, 'Fornecedores e Serviços', 'despesa', 'Building2', '#0284c7'
              );

              const { data: despesa } = await supabaseAdmin
                .from('despesas')
                .insert({
                  user_id: userId,
                  categoria_id: categoriaFornecedorId,
                  subcategoria_id: identificadoContato.subcategoria_padrao_id ?? null,
                  conta_id: contaId,
                  workspace_id: targetWorkspaceId,
                  contato_id: identificadoContato.id,
                  descricao: transacao.description ?? `Pagamento Fornecedor ${identificadoContato.nome} (${externalId})`,
                  valor: saqueValor,
                  data: hoje,
                  observacoes: `Conciliação automática Divipay (${isBoleto ? 'Boleto' : 'Pix'}) - ${externalId}`,
                  metodo_pagamento: isBoleto ? 'boleto' : 'pix',
                  status: 'pago',
                })
                .select('id')
                .single();

              const despesaId = despesa?.id ?? null;
              if (despesaId) metadata.despesa_id = despesaId;

              const metaType = metadata.paymentType;
              await supabaseAdmin.from('divipay_conciliacoes').upsert(
                {
                  user_id: userId,
                  workspace_id: targetWorkspaceId,
                  divipay_external_id: externalId,
                  tipo: typeof metaType === 'string' ? metaType : (isBoleto ? 'BILLET' : 'DICT'),
                  favorecido_nome: saqueFavorecidoNome || identificadoContato.nome,
                  favorecido_documento: saqueFavorecidoDocumento || identificadoContato.beneficiario_documento,
                  valor: saqueValor,
                  taxa: effectiveFee ?? 0,
                  data_pagamento: transacao.created_at,
                  descricao: transacao.description,
                  status: 'conciliada',
                  beneficiario_tipo: 'fornecedor',
                  contato_id: identificadoContato.id,
                  categoria_id: categoriaFornecedorId,
                  subcategoria_id: identificadoContato.subcategoria_padrao_id ?? null,
                  despesa_id: despesaId,
                  metodo_pagamento: isBoleto ? 'boleto' : 'pix',
                  origem_evidencia: 'webhook_identificacao_fornecedor',
                },
                { onConflict: 'user_id,divipay_external_id' }
              );
              metadata.conciliacao_status = 'conciliada';
              metadata.contato_id = identificadoContato.id;
            } else {
              // Nem colaborador nem fornecedor identificado: fila de revisão "Pagamentos a Identificar"
              const metaType = metadata.paymentType;
              await supabaseAdmin.from('divipay_conciliacoes').upsert(
                {
                  user_id: userId,
                  workspace_id: targetWorkspaceId,
                  divipay_external_id: externalId,
                  tipo: typeof metaType === 'string' ? metaType : (isBoleto ? 'BILLET' : 'DICT'),
                  favorecido_nome: saqueFavorecidoNome,
                  favorecido_documento: saqueFavorecidoDocumento,
                  valor: saqueValor,
                  taxa: effectiveFee ?? 0,
                  data_pagamento: transacao.created_at,
                  descricao: transacao.description,
                  status: 'pendente',
                  motivo_revisao: 'Beneficiário não identificado automaticamente',
                  divida_id: null,
                  divida_sugerida_id: null,
                  despesa_id: null,
                },
                { onConflict: 'user_id,divipay_external_id' }
              );
              metadata.conciliacao_status = 'pendente';
            }
          }
        }

        // Taxa do saque: despesa separada (dedupe pelo marcador divipay-taxa)
        if (effectiveFee && Number(effectiveFee) > 0) {
          const marcadorTaxa = `divipay-taxa:${externalId}`
          const { data: taxaExistente } = await supabaseAdmin
            .from('despesas')
            .select('id')
            .eq('user_id', userId)
            .ilike('observacoes', `%${marcadorTaxa}%`)
            .limit(1)
            .maybeSingle()

          if (!taxaExistente) {
            const categoriaTaxaSaqueId = await findOrCreateCategoria(
              supabaseAdmin, userId, 'Taxas Divipay / Tarifas Bancárias', 'despesa', 'Percent', '#ef4444',
            )
            const { data: despesaTaxaSaque, error: taxaSaqueError } = await supabaseAdmin
              .from('despesas')
              .insert({
                user_id: userId,
                categoria_id: categoriaTaxaSaqueId,
                conta_id: contaId,
                workspace_id: targetWorkspaceId,
                descricao: `Taxa Divipay - saque ${externalId}`,
                valor: Number(effectiveFee),
                data: hoje,
                observacoes: `Taxa do saque Divipay ${externalId} (${marcadorTaxa})`,
                metodo_pagamento: 'pix',
                status: 'pago',
              })
              .select('id')
              .single()

            if (taxaSaqueError) {
              console.error('Erro ao criar despesa de taxa do saque:', taxaSaqueError)
            } else {
              metadata.despesa_taxa_id = despesaTaxaSaque.id
            }
          }
        }
      }

      await supabaseAdmin
        .from('divipay_transacoes')
        .update({ metadata })
        .eq('id', transacao.id)
    }

    await markLog(true)
    return jsonResponse({ success: true })
  } catch (error) {
    console.error('Erro ao processar webhook Divipay:', error)

    if (webhookLogId) {
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        getSupabaseSecretKey(),
        { auth: { autoRefreshToken: false, persistSession: false } },
      )
      await supabaseAdmin
        .from('divipay_webhook_logs')
        .update({ processed: false, error_message: error instanceof Error ? error.message : String(error) })
        .eq('id', webhookLogId)
    }

    return jsonResponse({ success: false, error: error instanceof Error ? error.message : String(error) }, 500)
  }
})
