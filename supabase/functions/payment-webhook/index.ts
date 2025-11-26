// Edge Function para processar webhooks de pagamento
// URL: https://[seu-projeto].supabase.co/functions/v1/payment-webhook

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { 
  validateWebhookToken, 
  sanitizePayload, 
  validateRequiredFields,
  validateEmail,
  logValidationFailure 
} from '../_shared/validation.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Formato do webhook do Pepper
interface PepperWebhookPayload {
  token: string
  event: string // 'transaction'
  created_at: string
  platform: string // 'Pepper'
  status: string // 'paid', 'pending', 'cancelled'
  method: string // 'pix', 'billet', 'credit_card'
  customer: {
    id: string
    name: string
    email: string
    phone: string
    document: string
  }
  transaction: {
    id: string
    status: string
    method: string
    amount: number // em centavos
    amount_liquid: number
    net_amount: number
    url: string
    billet?: {
      url: string | null
      barcode: string
      expires_at: string | null
    }
    pix?: {
      code: string
      url: string
      expires_at: string | null
    }
  }
  offer: {
    hash: string
    title: string
    price: number
  }
  items: Array<{
    hash: string
    product_hash: string
    title: string
    price: number
    quantity: number
    cover: string
    operation_type: number
  }>
  tracking?: {
    src?: string
    utm_source?: string
    utm_campaign?: string
    utm_medium?: string
    utm_term?: string
    utm_content?: string
  }
}

// Formato genérico (compatibilidade)
interface WebhookPayload {
  event: string
  email: string
  plan_id?: string
  plan_name?: string
  amount?: number
  transaction_id?: string
  customer_name?: string
  customer_phone?: string
  metadata?: Record<string, any>
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Validate webhook token
    const url = new URL(req.url)
    const token = url.searchParams.get('token') || req.headers.get('x-webhook-token')
    const secret = Deno.env.get('PAYMENT_WEBHOOK_SECRET') || Deno.env.get('PEPPER_WEBHOOK_SECRET')

    if (!validateWebhookToken(token, secret || '')) {
      logValidationFailure('Invalid webhook token', {
        hasToken: !!token,
        hasSecret: !!secret,
      })
      
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Criar cliente Supabase com service_role (bypass RLS)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Parse and sanitize webhook payload
    const rawPayload = await req.json()
    const sanitizedRawPayload = sanitizePayload(rawPayload)
    
    console.log('Webhook recebido e sanitizado')

    // Detectar formato do payload (Pepper ou genérico)
    let payload: WebhookPayload
    
    if (sanitizedRawPayload.platform === 'Pepper' || sanitizedRawPayload.customer) {
      // Formato Pepper - converter para formato genérico
      const pepperPayload = sanitizedRawPayload as PepperWebhookPayload
      
      payload = {
        event: pepperPayload.status === 'paid' ? 'payment_completed' : 'payment_pending',
        email: pepperPayload.customer.email,
        customer_name: pepperPayload.customer.name,
        customer_phone: pepperPayload.customer.phone,
        amount: pepperPayload.transaction.amount / 100, // converter centavos para reais
        transaction_id: pepperPayload.transaction.id,
        plan_name: pepperPayload.offer.title,
        metadata: {
          platform: 'Pepper',
          method: pepperPayload.method,
          token: pepperPayload.token,
          customer_document: pepperPayload.customer.document,
          tracking: pepperPayload.tracking
        }
      }
      
      console.log('Payload convertido do Pepper')
    } else {
      // Formato genérico
      payload = sanitizedRawPayload as WebhookPayload
    }

    // Validate required fields
    const validation = validateRequiredFields(payload as Record<string, unknown>, ['event', 'email'])
    if (!validation.isValid) {
      logValidationFailure('Missing required fields', { error: validation.error })
      
      return new Response(
        JSON.stringify({ error: validation.error }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Validate email format
    if (!validateEmail(payload.email)) {
      logValidationFailure('Invalid email format', { email: payload.email })
      
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // 1. Registrar webhook no log
    const { data: logData, error: logError } = await supabaseAdmin
      .from('webhook_logs')
      .insert({
        payload: payload,
        event_type: payload.event,
        status: 'pending'
      })
      .select()
      .single()

    if (logError) {
      console.error('Erro ao registrar webhook:', logError)
    }

    const webhookLogId = logData?.id

    // 2. Processar apenas eventos de pagamento completado
    if (payload.event !== 'payment_completed') {
      await supabaseAdmin
        .from('webhook_logs')
        .update({ 
          status: 'processed',
          processed_at: new Date().toISOString(),
          error_message: 'Evento ignorado (não é payment_completed)'
        })
        .eq('id', webhookLogId)

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Evento ignorado' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    // 3. Validar dados obrigatórios
    if (!payload.email) {
      throw new Error('Email é obrigatório')
    }

    // 4. Buscar plano
    let planId = payload.plan_id
    
    if (!planId && payload.plan_name) {
      const { data: planData } = await supabaseAdmin
        .from('plans')
        .select('id')
        .ilike('name', payload.plan_name)
        .single()
      
      planId = planData?.id
    }

    if (!planId) {
      // Se não encontrou plano, usar o plano Essencial (gratuito)
      const { data: essentialPlan } = await supabaseAdmin
        .from('plans')
        .select('id')
        .eq('name', 'Essencial')
        .single()
      
      planId = essentialPlan?.id
    }

    // 5. Verificar se usuário já existe
    const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers()
    const userExists = existingUser.users.find(u => u.email === payload.email)

    let userId: string

    if (userExists) {
      // Usuário já existe, apenas atualizar assinatura
      userId = userExists.id
      
      console.log('Usuário já existe:', userId)

      // Buscar profile
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('user_id', userId)
        .single()

      if (profile) {
        // Atualizar ou criar assinatura
        await supabaseAdmin
          .from('subscriptions')
          .upsert({
            user_id: profile.id,
            plan_id: planId,
            status: 'active',
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 dias
          }, { onConflict: 'user_id' })

        // Registrar pagamento
        await supabaseAdmin
          .from('subscription_payments')
          .insert({
            user_id: userId,
            plan_id: planId,
            amount: payload.amount || 0,
            status: 'paid',
            payment_date: new Date().toISOString()
          })
      }

    } else {
      // Usuário não existe, criar diretamente com senha aleatória
      console.log('Criando novo usuário com senha aleatória')

      // Gerar senha aleatória segura (12 caracteres)
      const generatePassword = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*'
        let password = ''
        for (let i = 0; i < 12; i++) {
          password += chars.charAt(Math.floor(Math.random() * chars.length))
        }
        return password
      }

      const randomPassword = generatePassword()

      // Criar usuário no Supabase Auth
      const { data: newUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
        email: payload.email,
        password: randomPassword,
        email_confirm: true, // Confirmar email automaticamente
        user_metadata: {
          name: payload.customer_name || payload.email.split('@')[0],
          phone: payload.customer_phone || null
        }
      })

      if (createUserError) {
        console.error('Erro ao criar usuário:', createUserError)
        throw new Error(`Erro ao criar usuário: ${createUserError.message}`)
      }

      userId = newUser.user.id
      console.log('Usuário criado:', userId)

      // Criar perfil
      const { data: newProfile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .insert({
          user_id: userId,
          name: payload.customer_name || payload.email.split('@')[0],
          email: payload.email,
          telefone: payload.customer_phone || null,
          role: 'user'
        })
        .select()
        .single()

      if (profileError) {
        console.error('Erro ao criar perfil:', profileError)
        throw new Error(`Erro ao criar perfil: ${profileError.message}`)
      }

      // Criar assinatura
      await supabaseAdmin
        .from('subscriptions')
        .insert({
          user_id: newProfile.id,
          plan_id: planId,
          status: 'active',
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 dias
        })

      // Registrar pagamento
      await supabaseAdmin
        .from('subscription_payments')
        .insert({
          user_id: userId,
          plan_id: planId,
          amount: payload.amount || 0,
          status: 'paid',
          payment_date: new Date().toISOString()
        })

      // Enviar email com credenciais
      // Nota: Você precisará configurar um serviço de email (Resend, SendGrid, etc)
      // Por enquanto, vamos usar o sistema de email do Supabase
      
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #f97316;">Bem-vindo ao Wallet!</h2>
          <p>Seu pagamento foi confirmado com sucesso!</p>
          <p>Aqui estão suas credenciais de acesso:</p>
          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Email:</strong> ${payload.email}</p>
            <p style="margin: 5px 0;"><strong>Senha:</strong> ${randomPassword}</p>
          </div>
          <p>Acesse o sistema em: <a href="${Deno.env.get('SITE_URL')}/login">${Deno.env.get('SITE_URL')}/login</a></p>
          <p style="color: #6b7280; font-size: 14px;">Por segurança, recomendamos que você altere sua senha após o primeiro acesso.</p>
        </div>
      `

      // Enviar email usando Supabase (você pode substituir por outro serviço)
      try {
        // Nota: O Supabase não tem API direta para enviar emails customizados
        // Você precisará usar um serviço externo como Resend, SendGrid, etc.
        // Por enquanto, vamos apenas logar as credenciais
        console.log('Credenciais do novo usuário:')
        console.log('Email:', payload.email)
        console.log('Senha:', randomPassword)
        
        // TODO: Integrar com serviço de email
        // Exemplo com Resend:
        // await fetch('https://api.resend.com/emails', {
        //   method: 'POST',
        //   headers: {
        //     'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        //     'Content-Type': 'application/json'
        //   },
        //   body: JSON.stringify({
        //     from: 'Wallet <noreply@wallet.cortexx.online>',
        //     to: payload.email,
        //     subject: 'Bem-vindo ao Wallet - Suas Credenciais',
        //     html: emailHtml
        //   })
        // })
        
      } catch (emailError) {
        console.error('Erro ao enviar email:', emailError)
        // Não falhar o webhook se o email não for enviado
      }

      console.log('Usuário criado e configurado com sucesso')
    }

    // 6. Atualizar log como processado
    await supabaseAdmin
      .from('webhook_logs')
      .update({ 
        status: 'processed',
        processed_at: new Date().toISOString()
      })
      .eq('id', webhookLogId)

    // 7. Retornar sucesso
    return new Response(
      JSON.stringify({ 
        success: true,
        message: userExists 
          ? 'Assinatura atualizada com sucesso' 
          : 'Magic link enviado com sucesso',
        user_exists: !!userExists
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Erro ao processar webhook:', error)

    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})
