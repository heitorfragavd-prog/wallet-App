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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Validação inline (mesmo comportamento de _shared/validation.ts:validateWebhookToken)
function validateWebhookToken(token: string | null, secret: string): boolean {
  if (!token) return false
  if (!secret) return false
  return token === secret
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let webhookLogId: string | null = null

  try {
    // 1. Valida o token do webhook
    const url = new URL(req.url)
    const token = url.searchParams.get('token') || req.headers.get('x-webhook-token')
    const secret = Deno.env.get('DIVIPAY_WEBHOOK_SECRET') ?? ''

    if (!validateWebhookToken(token, secret)) {
      console.error('Webhook Divipay: token inválido', { hasToken: !!token, hasSecret: !!secret })
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
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

    // 4. Idempotência: transação já finalizada não gera novos lançamentos
    if (transacao.status === 'PAID') {
      await markLog(true)
      return jsonResponse({ success: true, message: 'Transação já processada anteriormente' })
    }

    const newStatus = mapStatus(status ?? event)
    if (!newStatus || newStatus === 'PENDING') {
      await markLog(true, 'Evento sem mudança de status relevante')
      return jsonResponse({ success: true, message: 'Evento ignorado (status sem alteração)' })
    }

    // 5. Atualiza o status da transação
    const effectiveFee = fee ?? transacao.fee ?? null
    await supabaseAdmin
      .from('divipay_transacoes')
      .update({ status: newStatus, fee: effectiveFee })
      .eq('id', transacao.id)

    // 6. Integração financeira apenas para confirmações (PAID)
    if (newStatus === 'PAID') {
      const userId = transacao.user_id
      const hoje = new Date().toISOString().slice(0, 10)
      const contaId = await findOrCreateConta(supabaseAdmin, userId)
      const metadata: Record<string, unknown> = { ...(transacao.metadata ?? {}) }

      if (transacao.type === 'CASH_IN') {
        // Receita com o valor bruto
        const categoriaReceitaId = await findOrCreateCategoria(
          supabaseAdmin, userId, 'Recebimentos Divipay', 'receita', 'Landmark', '#22c55e',
        )
        const { data: receita, error: receitaError } = await supabaseAdmin
          .from('receitas')
          .insert({
            user_id: userId,
            categoria_id: categoriaReceitaId,
            conta_id: contaId,
            descricao: transacao.description ?? `Recebimento Pix Divipay ${externalId}`,
            valor: transacao.amount,
            data: hoje,
            metodo_pagamento: 'pix',
            status: 'recebido',
          })
          .select('id')
          .single()

        if (receitaError) {
          console.error('Erro ao criar receita:', receitaError)
        } else {
          metadata.receita_id = receita.id
        }

        // Despesa com a taxa do gateway
        if (effectiveFee && Number(effectiveFee) > 0) {
          const categoriaTaxaId = await findOrCreateCategoria(
            supabaseAdmin, userId, 'Taxas Bancárias / Tarifas de Gateway', 'despesa', 'Percent', '#ef4444',
          )
          const { data: despesaTaxa, error: taxaError } = await supabaseAdmin
            .from('despesas')
            .insert({
              user_id: userId,
              categoria_id: categoriaTaxaId,
              conta_id: contaId,
              descricao: `Taxa Divipay - transação ${externalId}`,
              valor: Number(effectiveFee),
              data: hoje,
              metodo_pagamento: 'pix',
              status: 'pago',
            })
            .select('id')
            .single()

          if (taxaError) {
            console.error('Erro ao criar despesa de taxa:', taxaError)
          } else {
            metadata.despesa_taxa_id = despesaTaxa.id
          }
        }
      } else if (transacao.type === 'CASH_OUT') {
        // Saída: despesa com o valor transferido
        const categoriaSaidaId = await findOrCreateCategoria(
          supabaseAdmin, userId, 'Transferências e Saques Divipay', 'despesa', 'ArrowUpRight', '#f97316',
        )
        const { data: despesa, error: despesaError } = await supabaseAdmin
          .from('despesas')
          .insert({
            user_id: userId,
            categoria_id: categoriaSaidaId,
            conta_id: contaId,
            descricao: transacao.description ?? `Transferência Pix Divipay ${externalId}`,
            valor: transacao.amount,
            data: hoje,
            metodo_pagamento: 'pix',
            status: 'pago',
          })
          .select('id')
          .single()

        if (despesaError) {
          console.error('Erro ao criar despesa de cash-out:', despesaError)
        } else {
          metadata.despesa_id = despesa.id
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
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        { auth: { autoRefreshToken: false, persistSession: false } },
      )
      await supabaseAdmin
        .from('divipay_webhook_logs')
        .update({ processed: false, error_message: error.message })
        .eq('id', webhookLogId)
    }

    return jsonResponse({ success: false, error: error.message }, 500)
  }
})
