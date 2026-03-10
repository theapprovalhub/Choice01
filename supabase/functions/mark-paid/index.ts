// Choice Properties — Edge Function: mark-paid
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // ── Verify caller is an authenticated admin ──────────────
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!jwt) return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } })
  const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
  const { data: { user }, error: authErr } = await authClient.auth.getUser(jwt)
  if (authErr || !user) return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } })
  const supabaseCheck = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: adminRow } = await supabaseCheck.from('admin_roles').select('id').eq('user_id', user.id).maybeSingle()
  if (!adminRow) return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } })
  // ── End auth check ────────────────────────────────────────
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { app_id, notes } = await req.json()
    if (!app_id) throw new Error('app_id required')

    const { data: app, error: fetchErr } = await supabase.from('applications').select('email,first_name,last_name,phone,preferred_language').eq('app_id', app_id).single()
    if (fetchErr) throw new Error(fetchErr.message)

    const { error } = await supabase.from('applications').update({ payment_status: 'paid', payment_date: new Date().toISOString(), admin_notes: notes || null }).eq('app_id', app_id)
    if (error) throw new Error(error.message)

    const gasUrl = Deno.env.get('GAS_EMAIL_URL')!
    fetch(gasUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: Deno.env.get('GAS_RELAY_SECRET'), template: 'payment_confirmation', to: app.email, data: { app_id, applicant_name: `${app.first_name} ${app.last_name}`, phone: app.phone, preferred_language: app.preferred_language || 'en' } })
    }).then(async (r) => {
      const json = await r.json().catch(() => ({}))
      const ok = r.ok && json.success !== false
      await supabase.from('email_logs').insert({ type: 'payment_confirmation', recipient: app.email, status: ok ? 'sent' : 'failed', app_id, error_msg: ok ? null : (json.error || `HTTP ${r.status}`) })
    }).catch(async (e) => {
      await supabase.from('email_logs').insert({ type: 'payment_confirmation', recipient: app.email, status: 'failed', app_id, error_msg: e?.message || 'Network error' })
    })

    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
