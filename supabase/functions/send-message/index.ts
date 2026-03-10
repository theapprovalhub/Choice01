// Choice Properties — Edge Function: send-message
// Allowed callers:
//   • Admin users (admin_roles table)
//   • Authenticated landlords — only for applications on their own properties
// Tenant replies use the submit_tenant_reply() DB RPC (anon-callable) instead.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // ── Authenticate caller ───────────────────────────────────
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!jwt) return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } })
  const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
  const { data: { user }, error: authErr } = await authClient.auth.getUser(jwt)
  if (authErr || !user) return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } })

  const supabaseCheck = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: adminRow }    = await supabaseCheck.from('admin_roles').select('id').eq('user_id', user.id).maybeSingle()
  const { data: landlordRow } = await supabaseCheck.from('landlords').select('id').eq('user_id', user.id).maybeSingle()
  const isAdmin    = !!adminRow
  const isLandlord = !!landlordRow

  if (!isAdmin && !isLandlord) {
    return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
  // ── End auth check ────────────────────────────────────────

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { app_id, message, sender, sender_name } = await req.json()
    if (!app_id || !message) throw new Error('app_id and message required')

    // Landlords may only message applicants on their own properties
    if (!isAdmin && isLandlord) {
      const { data: appCheck } = await supabase
        .from('applications')
        .select('landlord_id')
        .eq('app_id', app_id)
        .single()
      if (!appCheck || appCheck.landlord_id !== landlordRow!.id) {
        return new Response(JSON.stringify({ success: false, error: 'Forbidden — not your property' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } })
      }
    }

    const { data: app, error: fetchErr } = await supabase.from('applications').select('email,first_name,preferred_language').eq('app_id', app_id).single()
    if (fetchErr) throw new Error(fetchErr.message)

    await supabase.from('messages').insert({ app_id, sender: sender || 'admin', sender_name: sender_name || 'Choice Properties', message })

    // Email tenant when admin or landlord sends a message
    if (sender === 'admin' || sender === 'landlord' || !sender) {
      const gasUrl = Deno.env.get('GAS_EMAIL_URL')!
      fetch(gasUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: Deno.env.get('GAS_RELAY_SECRET'), template: 'admin_message', to: app.email,
          data: { app_id, first_name: app.first_name, message, preferred_language: app.preferred_language || 'en' } })
      }).then(async (r) => {
        const json = await r.json().catch(() => ({}))
        const ok = r.ok && json.success !== false
        await supabase.from('email_logs').insert({ type: 'admin_message', recipient: app.email, status: ok ? 'sent' : 'failed', app_id, error_msg: ok ? null : (json.error || `HTTP ${r.status}`) })
      }).catch(async (e) => {
        await supabase.from('email_logs').insert({ type: 'admin_message', recipient: app.email, status: 'failed', app_id, error_msg: e?.message || 'Network error' })
      })
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
