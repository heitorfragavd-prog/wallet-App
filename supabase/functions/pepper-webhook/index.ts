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
        // Validate webhook token
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

        // Parse and sanitize payload
        const rawPayload = await req.json()
        const payload = sanitizePayload(rawPayload)

        // Log webhook
        await supabase.from('webhook_logs').insert({
            payload,
            status: 'received'
        })

        // Pepper payload usually has 'email' and 'offer_title' or similar
        // Adjust these fields based on actual Pepper documentation or payload
        const email = payload.email || payload.customer?.email
        const offerTitle = payload.offer_title || payload.product?.name

        if (!email) {
            logValidationFailure('Email not found in payload')
            throw new Error('Email not found in payload')
        }

        // Validate email format
        if (!validateEmail(email)) {
            logValidationFailure('Invalid email format', { email })
            throw new Error('Invalid email format')
        }

        // Find user
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id, user_id')
            .eq('email', email)
            .single()

        if (profileError || !profile) {
            console.error('User not found:', email)
            return new Response(JSON.stringify({ message: 'User not found, logged' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // Map offer to plan
        let planName = 'Pro' // Default
        if (offerTitle && offerTitle.toLowerCase().includes('black')) {
            planName = 'Black'
        }

        const { data: plan } = await supabase
            .from('plans')
            .select('id')
            .eq('name', planName)
            .single()

        if (!plan) {
            // If plan not found, maybe fallback to Pro or log error
            console.error(`Plan ${planName} not found`)
            throw new Error(`Plan ${planName} not found`)
        }

        // Update subscription
        const { error: subError } = await supabase
            .from('subscriptions')
            .upsert({
                user_id: profile.id,
                plan_id: plan.id,
                status: 'active',
                expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
            }, { onConflict: 'user_id' })

        if (subError) throw subError

        return new Response(JSON.stringify({ message: 'Subscription updated' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error) {
        console.error('Webhook error:', error)
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
