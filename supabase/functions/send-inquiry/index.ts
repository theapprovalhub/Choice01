// Choice Properties — Edge Function: send-inquiry
// Handles all inquiry-related emails server-side.
//
// Handles:
//   type: 'inquiry_reply'   → confirmation to tenant
//   type: 'new_inquiry'     → notification to landlord
//   type: 'app_id_recovery' → sends applicant their app_id link
//
// Called from: cp-api.js Inquiries.submit() and Applications.sendRecoveryEmail()
// No auth required — these are public-facing actions.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const gasUrl    = Deno.env.get('GAS_EMAIL_URL')
    const gasSecret = Deno.env.get('GAS_RELAY_SECRET')

    if (!gasUrl || !gasSecret) {
      console.warn('GAS_EMAIL_URL or GAS_RELAY_SECRET not configured — email skipped')
      return new Response(JSON.stringify({ success: true, warning: 'Email relay not configured' }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const { type } = body

    // ── App-ID Recovery ────────────────────────────────────
    if (type === 'app_id_recovery') {
      const { email, app_id, dashboard_url } = body
      if (!email || !app_id) throw new Error('email and app_id required')

      // Look up preferred_language from the application record
      const { data: appRow } = await supabase
        .from('applications')
        .select('preferred_language')
        .eq('app_id', app_id)
        .maybeSingle()
      const preferred_language = appRow?.preferred_language || 'en'

      fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: gasSecret,
          template: 'app_id_recovery',
          to: email,
          data: { app_id, email, dashboard_url, preferred_language },
        }),
      }).catch(() => {})

      await supabase.from('email_logs').insert({
        type: 'app_id_recovery',
        recipient: email,
        status: 'sent',
        app_id,
      })

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    // ── Inquiry Emails (tenant confirmation + landlord alert) ──
    const { tenant_name, tenant_email, tenant_language, message, property_id } = body
    if (!tenant_email) throw new Error('tenant_email required')

    // Tenant confirmation
    fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: gasSecret,
        template: 'inquiry_reply',
        to: tenant_email,
        data: { name: tenant_name, message, property: property_id, preferred_language: tenant_language || 'en' },
      }),
    }).then(async (r) => {
      const json = await r.json().catch(() => ({}))
      const ok = r.ok && json.success !== false
      await supabase.from('email_logs').insert({ type: 'inquiry_reply', recipient: tenant_email, status: ok ? 'sent' : 'failed', error_msg: ok ? null : (json.error || `HTTP ${r.status}`) })
    }).catch(async (e) => {
      await supabase.from('email_logs').insert({ type: 'inquiry_reply', recipient: tenant_email, status: 'failed', error_msg: e?.message || 'Network error' })
    })

    // Landlord notification
    if (property_id) {
      const { data: prop } = await supabase
        .from('properties')
        .select('title, address, city, landlords(email, contact_name, business_name)')
        .eq('id', property_id)
        .single()

      const landlordEmail = (prop as any)?.landlords?.email
      if (landlordEmail) {
        const landlordName =
          (prop as any)?.landlords?.business_name ||
          (prop as any)?.landlords?.contact_name ||
          'Landlord'

        fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            secret: gasSecret,
            template: 'new_inquiry',
            to: landlordEmail,
            data: {
              landlordName,
              tenantName: tenant_name,
              tenantEmail: tenant_email,
              message,
              property: prop
                ? `${(prop as any).title} — ${(prop as any).address}, ${(prop as any).city}`
                : property_id,
              propertyId: property_id,
            },
          }),
        }).then(async (r) => {
          const json = await r.json().catch(() => ({}))
          const ok = r.ok && json.success !== false
          await supabase.from('email_logs').insert({ type: 'new_inquiry_landlord', recipient: landlordEmail, status: ok ? 'sent' : 'failed', error_msg: ok ? null : (json.error || `HTTP ${r.status}`) })
        }).catch(async (e) => {
          await supabase.from('email_logs').insert({ type: 'new_inquiry_landlord', recipient: landlordEmail, status: 'failed', error_msg: e?.message || 'Network error' })
        })
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})
