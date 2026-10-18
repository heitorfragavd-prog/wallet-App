import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { 
  validateWebhookToken, 
  sanitizePayload,
  validateEmail,
  logValidationFailure 
} from '../_shared/validation.ts'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // 1. Validação estrita e Fail-Closed do token de webhook
        const url = new URL(req.url)
        const token = url.searchParams.get('token') || req.headers.get('x-webhook-token')
        const secret = Deno.env.get('PEPPER_WEBHOOK_SECRET')

        if (!validateWebhookToken(token, secret || '')) {
            logValidationFailure('Invalid webhook token', {
                hasToken: !!token,
                hasSecret: !!secret,
            })
            
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        )

        // 2. Parse e sanitização do payload
        const rawPayload = await req.json()
        const payload = sanitizePayload(rawPayload)

        // Registrar log do webhook para auditoria
        await supabase.from('webhook_logs').insert({
            payload,
            event_type: payload.event || payload.status || 'pepper_event',
            status: 'received'
        })

        // 3. SEGURANÇA CRÍTICA: Somente pagamentos confirmados podem ativar planos
        const status = String(
          payload.status || 
          payload.transaction?.status || 
          payload.event || 
          ''
        ).toLowerCase().trim()

        const isPaid = status === 'paid' || status === 'approved' || status === 'payment_completed'

        if (!isPaid) {
            console.log(`[pepper-webhook] Evento ignorado (status não pago/confirmado: "${status}")`)
            return new Response(JSON.stringify({ 
                success: true, 
                message: `Evento ignorado: status "${status}" não ativa plano` 
            }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // 4. Identificar dados do cliente e da transação
        const email = payload.email || payload.customer?.email
        const offerTitle = payload.offer_title || payload.offer?.title || payload.product?.name
        const transactionId = payload.transaction?.id || payload.transaction_id || payload.id

        if (!email) {
            logValidationFailure('Email not found in payload')
            throw new Error('Email not found in payload')
        }

        if (!validateEmail(email)) {
            logValidationFailure('Invalid email format', { email })
            throw new Error('Invalid email format')
        }

        // 5. Idempotência Financeira: Verificar se a transação já foi processada
        if (transactionId) {
            const { data: existingPayment } = await supabase
                .from('subscription_payments')
                .select('id')
                .eq('transaction_id', String(transactionId))
                .maybeSingle()

            if (existingPayment) {
                console.log(`[pepper-webhook] Transação ${transactionId} já processada anteriormente (idempotente).`)
                return new Response(JSON.stringify({ 
                    success: true, 
                    message: 'Transação já processada anteriormente' 
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 200,
                })
            }
        }

        // 6. Localizar perfil do usuário
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id, user_id')
            .eq('email', email)
            .single()

        if (profileError || !profile) {
            console.error('User not found:', email)
            return new Response(JSON.stringify({ message: 'User not found, logged' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // 7. Mapear plano correspondente
        let planName = 'Pro'
        if (offerTitle && offerTitle.toLowerCase().includes('black')) {
            planName = 'Black'
        }

        const { data: plan } = await supabase
            .from('plans')
            .select('id')
            .eq('name', planName)
            .single()

        if (!plan) {
            console.error(`Plan ${planName} not found`)
            throw new Error(`Plan ${planName} not found`)
        }

        // 8 e 9. Registro atômico do pagamento e ativação da assinatura
        const amountCents = payload.transaction?.amount ?? payload.amount ?? 0
        const amountReais = typeof amountCents === 'number' && amountCents > 1000 ? amountCents / 100 : Number(amountCents)

        let processedViaRpc = false
        try {
          const { data: rpcRes, error: rpcErr } = await supabase.rpc('registrar_pagamento_assinatura_atomico', {
            p_user_id: profile.user_id,
            p_profile_id: profile.id,
            p_plan_id: plan.id,
            p_provider: 'pepper',
            p_transaction_id: transactionId ? String(transactionId) : null,
            p_amount: amountReais,
            p_duration_days: 30
          })

          if (!rpcErr && rpcRes?.success) {
            processedViaRpc = true
            if (rpcRes.duplicate) {
              return new Response(JSON.stringify({ 
                success: true, 
                message: 'Transação já processada anteriormente (idempotente RPC)' 
              }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
              })
            }
          } else if (rpcErr) {
            const isMissingFunction = rpcErr.code === 'PGRST202' || rpcErr.code === '42883' || rpcErr.message?.includes('function') || rpcErr.message?.includes('not found');
            if (!isMissingFunction) {
              console.error('[pepper-webhook] Falha controlada na RPC registrar_pagamento_assinatura_atomico:', rpcErr);
              throw new Error(`Falha atômica ao registrar pagamento Pepper: ${rpcErr.message}`);
            }
            console.warn('[pepper-webhook] RPC registrar_pagamento_assinatura_atomico ausente, usando fallback legado...');
          }
        } catch (rpcEx) {
          if (rpcEx instanceof Error && rpcEx.message.includes('Falha atômica')) {
            throw rpcEx;
          }
        }

        if (!processedViaRpc) {
          // Fallback defensivo
          const { error: subError } = await supabase
            .from('subscriptions')
            .upsert({
              user_id: profile.id,
              plan_id: plan.id,
              status: 'active',
              expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
            }, { onConflict: 'user_id' })

          if (subError) throw subError

          await supabase
            .from('subscription_payments')
            .insert({
              user_id: profile.user_id,
              plan_id: plan.id,
              amount: amountReais,
              status: 'paid',
              provider: 'pepper',
              payment_date: new Date().toISOString(),
              transaction_id: transactionId ? String(transactionId) : null,
            })
        }

        return new Response(JSON.stringify({ message: 'Subscription updated and payment recorded' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error) {
        console.error('Webhook error:', error)
        return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
