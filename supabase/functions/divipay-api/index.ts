// Edge Function: proxy autenticado para a API Divipay
// URL: https://[seu-projeto].supabase.co/functions/v1/divipay-api
// O usuário é autenticado via JWT do Supabase; as credenciais Divipay
// (client_id/client_secret) ficam armazenadas em public.divipay_config
// e nunca são expostas ao frontend.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BASE_URLS: Record<string, string> = {
  sandbox: 'https://pay-sandbox.hge.app',
  production: 'https://api.divipay.com.br',
}

interface DivipayConfig {
  id: string
  user_id: string
  client_id: string | null
  client_secret: string | null
  environment: 'sandbox' | 'production'
  access_token: string | null
  token_expires_at: string | null
  webhook_url: string | null
  is_active: boolean
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function fetchWithTimeout(url: string, init: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const { timeout = 20000, ...fetchInit } = init
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)
  return fetch(url, { ...fetchInit, signal: controller.signal }).finally(() => clearTimeout(id))
}

function getErrorMessage(data: unknown): string {
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>
    return String(record.message ?? record.error ?? "")
  }
  return ""
}

// Obtém (ou reutiliza) o token Bearer da Divipay.
// POST /api/auth retorna { token, expireIn, expireOn, type }
async function getDivipayToken(supabaseAdmin: any, config: DivipayConfig): Promise<string> {
  const expiresAt = config.token_expires_at ? new Date(config.token_expires_at).getTime() : 0
  if (config.access_token && expiresAt > Date.now() + 60_000) {
    console.log('[divipay-api] Reutilizando token em cache')
    return config.access_token
  }

  const baseUrl = BASE_URLS[config.environment] ?? BASE_URLS.sandbox
  const authUrl = `${baseUrl}/api/auth`
  console.log('[divipay-api] Autenticando na Divipay:', authUrl, 'env:', config.environment)

  let resp: Response
  try {
    resp = await fetchWithTimeout(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        client_id: config.client_id,
        client_secret: config.client_secret,
        clientId: config.client_id,
        clientSecret: config.client_secret,
      }),
      timeout: 15000,
    })
  } catch (fetchErr: unknown) {
    const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
    console.error('[divipay-api] Timeout/network error ao chamar /api/auth:', errMsg)
    throw new Error(`Erro de rede ao autenticar na Divipay: ${errMsg}`)
  }

  const rawBody = await resp.text()
  console.log('[divipay-api] Auth response status:', resp.status, 'body:', rawBody.slice(0, 500))

  let data: Record<string, unknown> = {}
  try {
    data = JSON.parse(rawBody)
  } catch {
    console.error('[divipay-api] Resposta da auth não é JSON válido:', rawBody.slice(0, 200))
    throw new Error(`Falha na autenticação Divipay (${resp.status}): resposta inválida do servidor`)
  }

  // Suporta múltiplos campos de token que a API pode retornar
  const token = data?.token ?? data?.access_token ?? data?.accessToken ?? data?.data?.token ?? null

  if (!resp.ok || !token) {
    const errMsg = data?.message ?? data?.error ?? data?.detail ?? `verifique client_id/client_secret (status ${resp.status})`
    console.error('[divipay-api] Auth falhou:', { status: resp.status, data, errMsg })
    throw new Error(`Falha na autenticação Divipay (${resp.status}): ${errMsg}`)
  }

  const tokenStr = String(token)
  const tokenExpiresAt = data.expireOn
    ? new Date(String(data.expireOn)).toISOString()
    : data.expireIn
    ? new Date(Date.now() + (Number(data.expireIn) * 1000)).toISOString()
    : new Date(Date.now() + 86400 * 1000).toISOString()

  console.log('[divipay-api] Token obtido, expira em:', tokenExpiresAt)

  await supabaseAdmin
    .from('divipay_config')
    .update({ access_token: tokenStr, token_expires_at: tokenExpiresAt })
    .eq('id', config.id)

  return tokenStr
}

async function divipayFetch(
  config: DivipayConfig,
  token: string,
  path: string,
  options: { method?: string; body?: unknown; query?: Record<string, string | number | undefined> } = {},
) {
  const baseUrl = BASE_URLS[config.environment] ?? BASE_URLS.sandbox
  const url = new URL(`${baseUrl}${path}`)
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }

  console.log('[divipay-api] divipayFetch:', options.method ?? 'GET', url.toString())

  let resp: Response
  try {
    resp = await fetchWithTimeout(url.toString(), {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      timeout: 20000,
    })
  } catch (fetchErr: unknown) {
    const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
    console.error('[divipay-api] Timeout/network error:', options.method ?? 'GET', path, errMsg)
    throw new Error(`Erro de rede em ${path}: ${errMsg}`)
  }

  const rawBody = await resp.text()
  console.log('[divipay-api] Response', resp.status, path, rawBody.slice(0, 300))

  let data: unknown = {}
  try {
    data = JSON.parse(rawBody)
  } catch {
    if (!resp.ok) {
      throw new Error(`Divipay ${options.method ?? 'GET'} ${path} falhou (${resp.status}): resposta não-JSON`)
    }
    return {}
  }

  if (!resp.ok) {
    const message = getErrorMessage(data) || `Erro HTTP ${resp.status}`
    console.error('[divipay-api] API error:', resp.status, path, message)
    throw new Error(`Divipay ${options.method ?? 'GET'} ${path} falhou (${resp.status}): ${message}`)
  }
  return data
}

// Mapeia status da Divipay para o status local
function mapStatus(status: unknown): 'PENDING' | 'PAID' | 'FAILED' | 'CANCELED' {
  const s = String(status ?? '').toUpperCase()
  if (['PAID', 'APPROVED', 'FINISHED', 'CONFIRMED', 'COMPLETED'].includes(s)) return 'PAID'
  if (['CANCELED', 'CANCELLED', 'EXPIRED', 'REFUNDED'].includes(s)) return 'CANCELED'
  if (['FAILED', 'ERROR', 'REJECTED'].includes(s)) return 'FAILED'
  return 'PENDING'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Autentica o usuário pelo JWT do Supabase
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ success: false, error: 'Token de autenticação ausente' }, 401)
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) {
      return jsonResponse({ success: false, error: 'Usuário não autenticado' }, 401)
    }

    // 2. Carrega a configuração Divipay do usuário
    const { data: config, error: configError } = await supabaseAdmin
      .from('divipay_config')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    if (configError || !config) {
      return jsonResponse({ success: false, error: 'Configuração Divipay não encontrada. Cadastre as credenciais na aba Configurações.' }, 400)
    }
    if (!config.is_active) {
      return jsonResponse({ success: false, error: 'Integração Divipay está desativada.' }, 400)
    }
    if (!config.client_id || !config.client_secret) {
      return jsonResponse({ success: false, error: 'Credenciais Divipay (client_id/client_secret) não configuradas.' }, 400)
    }

    const { action, ...params } = await req.json()
    if (!action) {
      return jsonResponse({ success: false, error: 'Campo "action" é obrigatório' }, 400)
    }

    // 3. Garante token válido e executa a ação
    const divipayToken = await getDivipayToken(supabaseAdmin, config as DivipayConfig)
    const cfg = config as DivipayConfig

    switch (action) {
      case 'getBalance': {
        const data = await divipayFetch(cfg, divipayToken, '/api/me')
        return jsonResponse({ success: true, data })
      }

      case 'createPixCharge': {
        const amount = Number(params.amount)
        if (!amount || amount <= 0) {
          return jsonResponse({ success: false, error: 'Valor (amount) inválido' }, 400)
        }
        const description = String(params.description ?? 'Recarga Wallet').slice(0, 25)
        const referenceId = crypto.randomUUID()
        const webhookSecret = Deno.env.get('DIVIPAY_WEBHOOK_SECRET') ?? ''
        const callbackUrl = cfg.webhook_url
          ?? `${Deno.env.get('SUPABASE_URL')}/functions/v1/divipay-webhook?token=${webhookSecret}`

        const client = params.client ?? {}
        const chargeBody = {
          amount,
          description,
          referenceId,
          callbackUrl,
          expirationSeconds: Number(params.expirationSeconds ?? 3600),
          client: {
            name: client.name ?? 'Cliente Wallet',
            phone: client.phone ?? '11999999999',
            fingerprint: client.fingerprint ?? client.phone ?? '11999999999',
            document: client.document ?? '00000000000',
            email: client.email ?? 'cliente@wallet.local',
          },
          itens: [{ name: description, quantity: 1, unitPrice: amount, feePercent: 0 }],
        }

        const data = await divipayFetch(cfg, divipayToken, '/api/charge/pix', {
          method: 'POST',
          body: chargeBody,
        })

        const externalId = data?.id ?? data?.chargeId ?? data?.charge?.id ?? null
        const pixCopyPaste = data?.pixCopyPaste ?? data?.copyPaste ?? data?.brcode ?? data?.pix?.copyPaste ?? null
        const pixQrCode = data?.qrCode ?? data?.qrCodeBase64 ?? data?.pix?.qrCode ?? null

        const { data: transacao, error: insertError } = await supabaseAdmin
          .from('divipay_transacoes')
          .insert({
            user_id: user.id,
            external_id: externalId ?? referenceId,
            amount,
            type: 'CASH_IN',
            status: 'PENDING',
            description,
            pix_copy_paste: pixCopyPaste,
            pix_qr_code: pixQrCode,
            metadata: { referenceId, chargeResponse: data },
          })
          .select()
          .single()

        if (insertError) {
          console.error('Erro ao salvar transação local:', insertError)
        }

        return jsonResponse({ success: true, data: { transacao, charge: data } }, 201)
      }

      case 'consultPixCharge': {
        if (!params.chargeId) return jsonResponse({ success: false, error: 'chargeId é obrigatório' }, 400)
        const data = await divipayFetch(cfg, divipayToken, `/api/charge/${params.chargeId}/pix`)

        const newStatus = mapStatus(data?.status)
        if (newStatus !== 'PENDING') {
          await supabaseAdmin
            .from('divipay_transacoes')
            .update({ status: newStatus })
            .eq('user_id', user.id)
            .eq('external_id', params.chargeId)
            .eq('status', 'PENDING')
        }
        return jsonResponse({ success: true, data })
      }

      case 'cancelPixCharge': {
        if (!params.chargeId) return jsonResponse({ success: false, error: 'chargeId é obrigatório' }, 400)
        const data = await divipayFetch(cfg, divipayToken, `/api/charge/${params.chargeId}/pix`, { method: 'DELETE' })
        await supabaseAdmin
          .from('divipay_transacoes')
          .update({ status: 'CANCELED' })
          .eq('user_id', user.id)
          .eq('external_id', params.chargeId)
        return jsonResponse({ success: true, data })
      }

      case 'validatePixKey': {
        if (!params.key) return jsonResponse({ success: false, error: 'Chave Pix (key) é obrigatória' }, 400)
        const data = await divipayFetch(cfg, divipayToken, '/api/withdraws/validate-pix', {
          query: { key: params.key },
        })
        return jsonResponse({ success: true, data })
      }

      case 'createWithdraw': {
        const amount = Number(params.amount)
        if (!amount || amount <= 0) {
          return jsonResponse({ success: false, error: 'Valor (amount) inválido' }, 400)
        }

        const isBillet = params.type === 'BILLET'
        if (!isBillet && !params.keyPix) {
          return jsonResponse({ success: false, error: 'Chave Pix (keyPix) é obrigatória para transferências Pix' }, 400)
        }
        if (isBillet && !params.billetCode) {
          return jsonResponse({ success: false, error: 'Código do boleto (billetCode) é obrigatório' }, 400)
        }

        const body = isBillet ? {
          type: 'BILLET',
          amount,
          billetCode: params.billetCode,
        } : {
          type: 'DICT',
          amount,
          keyPix: params.keyPix,
          consultId: params.consultId,
        }

        const data = await divipayFetch(cfg, divipayToken, '/api/withdraws', {
          method: 'POST',
          body,
        })

        const { data: transacao } = await supabaseAdmin
          .from('divipay_transacoes')
          .insert({
            user_id: user.id,
            external_id: data?.id ?? null,
            amount,
            type: 'CASH_OUT',
            status: 'PENDING',
            description: params.description ?? (isBillet ? `Pagamento Boleto` : `Transferência Pix para ${params.keyPix}`),
            recipient_key: isBillet ? (params.billetCode || '') : (params.keyPix || ''),
            metadata: {
              withdrawResponse: data,
              // Quando o pagamento é de uma dívida, o divida_id viaja na metadata
              // para o webhook dar baixa direta na dívida ao confirmar o saque.
              ...(params.dividaId ? { divida_id: String(params.dividaId) } : {}),
              ...(params.metadata && typeof params.metadata === 'object' ? params.metadata : {}),
            },
          })
          .select()
          .single()

        return jsonResponse({ success: true, data: { transacao, withdraw: data } }, 201)
      }

      case 'getWithdraw': {
        if (!params.id) return jsonResponse({ success: false, error: 'ID do saque é obrigatório' }, 400)
        const data = await divipayFetch(cfg, divipayToken, `/api/withdraws/${params.id}`)
        return jsonResponse({ success: true, data })
      }

      case 'listWithdraws': {
        const data = await divipayFetch(cfg, divipayToken, '/api/withdraws', {
          query: { limit: params.limit ?? 50, offset: params.offset ?? 0 },
        })
        return jsonResponse({ success: true, data })
      }

      case 'listMovements': {
        let initialDateStr = params.initialDate ? String(params.initialDate) : undefined
        let finalDateStr = params.finalDate ? String(params.finalDate) : undefined

        if (initialDateStr && !initialDateStr.includes('T')) {
          initialDateStr = `${initialDateStr}T00:00:00.000Z`
        }
        if (finalDateStr && !finalDateStr.includes('T')) {
          finalDateStr = `${finalDateStr}T23:59:59.999Z`
        }

        const data = await divipayFetch(cfg, divipayToken, '/api/movements', {
          query: {
            limit: params.limit ?? 100,
            cursor: params.cursor,
            initialDate: initialDateStr,
            finalDate: finalDateStr,
            status: params.status,
            type: params.type,
          },
        })
        return jsonResponse({ success: true, data })
      }

      case 'configureWebhook': {
        const webhookSecret = Deno.env.get('DIVIPAY_WEBHOOK_SECRET') ?? ''
        const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/divipay-webhook?token=${webhookSecret}`
        const data = await divipayFetch(cfg, divipayToken, '/api/customer/webhook', {
          method: 'PUT',
          body: { url: webhookUrl },
        })
        await supabaseAdmin
          .from('divipay_config')
          .update({ webhook_url: webhookUrl })
          .eq('id', cfg.id)
        return jsonResponse({ success: true, data: { webhookUrl, response: data } })
      }

      default:
        return jsonResponse({ success: false, error: `Ação desconhecida: ${action}` }, 400)
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error('[divipay-api] Erro não tratado:', errMsg, error)
    return jsonResponse({ success: false, error: errMsg }, 500)
  }
})
