// Choice Properties — Edge Function: sign-lease
// Handles tenant signing, co-applicant signing, PDF generation, and admin void action.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }

function fmt(n: any) { return parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function fmtDate(d: any) { return d ? new Date(d).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }) : '—' }

// Build the full signed-lease HTML for PDF/storage
function buildLeaseHTML(app: any): string {
  const tenantName    = `${app.first_name} ${app.last_name}`
  const coName        = app.has_co_applicant && app.co_applicant_first_name
    ? `${app.co_applicant_first_name} ${app.co_applicant_last_name || ''}`.trim() : null
  const landlordName  = app.lease_landlord_name  || 'Choice Properties'
  const landlordAddr  = app.lease_landlord_address || 'Nationwide'
  const lateFeeFlat   = fmt(app.lease_late_fee_flat  || 50)
  const lateFeeDaily  = fmt(app.lease_late_fee_daily || 10)
  const petPolicy     = app.lease_pets_policy    || 'No pets permitted without prior written consent.'
  const smokingPolicy = app.lease_smoking_policy || 'Smoking strictly prohibited on Premises.'

  let compliance: any = {}
  try { compliance = JSON.parse(app.lease_compliance_snapshot || '{}') } catch(_) {}
  const eSignLaw    = compliance.eSignLaw    || 'E-SIGN Act (15 U.S.C. §7001)'
  const depositReturn = compliance.depositReturn || 30
  const noticeDays  = compliance.noticeToVacate  || 30
  const disclosures: string[] = compliance.disclosures || ['Lead paint disclosure for pre-1978 properties']
  const today       = new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })
  const signedAt    = app.lease_signed_date
    ? new Date(app.lease_signed_date).toLocaleString('en-US', { year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' })
    : today

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Signed Lease — ${app.app_id}</title>
<style>
  body { font-family: Georgia, serif; font-size: 13px; line-height: 1.8; color: #1a1a1a; max-width: 760px; margin: 0 auto; padding: 40px 30px; }
  h1 { font-size: 18px; text-align: center; text-transform: uppercase; letter-spacing: .12em; margin-bottom: 4px; }
  .subtitle { text-align: center; font-size: 12px; color: #555; margin-bottom: 30px; }
  h2 { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin: 22px 0 10px; }
  table.info { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.info td { padding: 5px 8px; border: 1px solid #ddd; }
  table.info td:first-child { width: 38%; background: #f5f5f5; font-weight: 600; }
  .fin-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #eee; font-size: 12px; }
  .fin-total { font-weight: 700; font-size: 13px; padding-top: 6px; }
  p { margin: 6px 0; }
  .sig-block { border: 1px solid #999; border-radius: 4px; padding: 14px 18px; margin: 8px 0; background: #fafafa; }
  .sig-name { font-family: Georgia, serif; font-style: italic; font-size: 20px; color: #0a1628; border-bottom: 2px solid #0a1628; padding-bottom: 4px; display: inline-block; min-width: 280px; }
  .sig-meta { font-size: 10px; color: #666; margin-top: 6px; }
  .disclosure { background: #fff8e1; border-left: 3px solid #f59e0b; padding: 8px 12px; margin: 6px 0; font-size: 11px; }
  .footer { margin-top: 40px; border-top: 1px solid #ccc; padding-top: 14px; font-size: 10px; color: #777; text-align: center; }
  .stamp { background: #d1fae5; border: 2px solid #059669; border-radius: 6px; padding: 10px 16px; text-align: center; font-weight: 700; color: #065f46; font-size: 13px; margin-bottom: 24px; }
</style>
</head>
<body>
<h1>Residential Lease Agreement</h1>
<div class="subtitle">Signed Copy — ${app.app_id} — Generated ${today}</div>

<div class="stamp">✓ Electronically Executed — Legally Binding Document</div>

<h2>Article 1 — Parties and Premises</h2>
<table class="info">
  <tr><td>Landlord</td><td><strong>${landlordName}</strong><br><span style="font-size:11px;color:#555">${landlordAddr}</span></td></tr>
  <tr><td>Tenant</td><td><strong>${tenantName}</strong>${coName ? `<br>Co-Applicant: <strong>${coName}</strong>` : ''}</td></tr>
  <tr><td>Premises</td><td><strong>${app.property_address || '—'}</strong></td></tr>
  <tr><td>Application Reference</td><td style="font-family:monospace">${app.app_id}</td></tr>
</table>

<h2>Article 2 — Lease Term</h2>
<table class="info">
  <tr><td>Commencement Date</td><td><strong>${fmtDate(app.lease_start_date)}</strong></td></tr>
  <tr><td>Termination Date</td><td><strong>${fmtDate(app.lease_end_date)}</strong></td></tr>
  <tr><td>Lease Type</td><td>${app.desired_lease_term || '12-Month Fixed Term'}</td></tr>
</table>
<p>The tenancy shall commence on <strong>${fmtDate(app.lease_start_date)}</strong> and terminate on <strong>${fmtDate(app.lease_end_date)}</strong>. This Agreement shall not convert to a month-to-month tenancy after the end date without express written agreement by both parties.</p>

<h2>Article 3 — Rent</h2>
<div class="fin-row"><span>Monthly Rent</span><span><strong>$${fmt(app.monthly_rent)}</strong></span></div>
<div class="fin-row"><span>Security Deposit</span><span><strong>$${fmt(app.security_deposit)}</strong></span></div>
<div class="fin-row fin-total"><span>Total Due at Move-In</span><span>$${fmt(app.move_in_costs)}</span></div>
<p style="margin-top:10px">Rent of <strong>$${fmt(app.monthly_rent)}</strong> is due on the first (1st) day of each calendar month via a payment method agreed with the Landlord's leasing team.</p>

<h2>Article 4 — Late Fees</h2>
<p>If rent is not received by the applicable grace period under state law, a late fee of <strong>$${lateFeeFlat}</strong> will be assessed immediately, plus <strong>$${lateFeeDaily} per day</strong> for each additional day rent remains unpaid. Time is of the essence with respect to rent payment.</p>

<h2>Article 5 — Security Deposit</h2>
<p>A security deposit of <strong>$${fmt(app.security_deposit)}</strong> is held by Landlord and will be returned within <strong>${depositReturn} days</strong> of lease termination as required by applicable state law, less any deductions itemized in writing for damages or unpaid rent.</p>

<h2>Article 6 — Move-In Costs</h2>
<p>Prior to taking possession, Tenant shall pay the total move-in amount of <strong>$${fmt(app.move_in_costs)}</strong> (first month's rent of $${fmt(app.monthly_rent)} + security deposit of $${fmt(app.security_deposit)}). Possession is not delivered until all move-in funds are received and confirmed.</p>

<h2>Article 7 — Use of Premises</h2>
<p>The Premises shall be used solely as a private residential dwelling by the named Tenant(s) and approved occupants. No commercial activity, subletting, or assignment without prior written consent of Landlord. Tenant shall comply with all applicable laws, ordinances, and community rules.</p>

<h2>Article 8 — Maintenance and Repairs</h2>
<p>Tenant shall maintain the Premises in a clean, sanitary, and habitable condition. Tenant shall promptly notify Landlord of any damage or required repairs. Tenant is responsible for damage caused by negligence or intentional acts of Tenant, guests, or occupants. No alterations without prior written consent.</p>

<h2>Article 9 — Entry by Landlord</h2>
<p>Landlord or Landlord's agents may enter the Premises at reasonable times with advance notice as required by applicable law for inspection, repairs, or showing to prospective tenants or purchasers.</p>

<h2>Article 10 — Pets and Smoking</h2>
<p><strong>Pets:</strong> ${petPolicy}</p>
<p><strong>Smoking:</strong> ${smokingPolicy}</p>

<h2>Article 11 — Default and Termination</h2>
<p>A material breach of this Agreement, including non-payment of rent, entitles Landlord to terminate upon the notice period required by applicable state law (minimum <strong>${noticeDays} days</strong> written notice for this jurisdiction). Tenant shall vacate upon termination. Holdover tenancy without written consent results in liability for damages.</p>

<h2>Article 12 — Notice to Vacate</h2>
<p>Either party may terminate at the end of the lease term upon written notice as required by applicable state law. For this jurisdiction, a minimum of <strong>${noticeDays} days</strong> written notice is required.</p>

<h2>Article 13 — Governing Law</h2>
<p>This Agreement is governed by the laws of the state in which the Premises is located. Disputes shall be resolved in the courts of that jurisdiction.</p>

<h2>Article 14 — Electronic Signature</h2>
<p>This Agreement may be executed by electronic signature, which is legally binding to the same extent as a handwritten signature pursuant to the <strong>${eSignLaw}</strong>. Each party's electronic signature constitutes their original signature for all purposes.</p>

<h2>Article 15 — Entire Agreement</h2>
<p>This Agreement constitutes the entire agreement between the parties and supersedes all prior agreements. It may only be modified by written instrument signed by both parties.</p>

<h2>Article 16 — Required Disclosures</h2>
${disclosures.map((d: string) => `<div class="disclosure">⚠️ ${d}</div>`).join('\n')}
<div class="disclosure">⚠️ Equal Housing Opportunity: This property is offered in compliance with all applicable federal, state, and local fair housing laws. Discrimination on the basis of any protected class is prohibited.</div>

<h2>Signatures</h2>

<p><strong>Tenant Signature:</strong></p>
<div class="sig-block">
  <div class="sig-name">${app.tenant_signature || '—'}</div>
  <div class="sig-meta">
    ${tenantName} &nbsp;·&nbsp; Signed electronically on ${signedAt}<br>
    IP Address: ${app.lease_ip_address || 'recorded'} &nbsp;·&nbsp; Application: ${app.app_id}
  </div>
</div>

${app.has_co_applicant && app.co_applicant_signature ? `
<p><strong>Co-Applicant Signature:</strong></p>
<div class="sig-block">
  <div class="sig-name">${app.co_applicant_signature}</div>
  <div class="sig-meta">
    ${coName || 'Co-Applicant'} &nbsp;·&nbsp; Signed electronically on ${app.co_applicant_signature_timestamp ? new Date(app.co_applicant_signature_timestamp).toLocaleString('en-US') : signedAt}<br>
    Application: ${app.app_id}
  </div>
</div>` : (app.has_co_applicant ? '<p style="color:#b45309"><em>Co-applicant signature pending.</em></p>' : '')}

<p><strong>Landlord:</strong></p>
<div class="sig-block">
  <div class="sig-name">${landlordName}</div>
  <div class="sig-meta">Executed by: Choice Properties Leasing System &nbsp;·&nbsp; ${today}</div>
</div>

<div class="footer">
  Choice Properties &nbsp;·&nbsp; Nationwide Rental Marketplace &nbsp;·&nbsp; Equal Housing Opportunity<br>
  Document Reference: ${app.app_id} &nbsp;·&nbsp; Generated: ${today}<br>
  This is a legally binding electronic lease agreement executed under applicable state and federal e-signature law.
</div>
</body>
</html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // ── Parse body first so we can route by action ───────────
  // Tenant signing (no action / is_co_applicant) is allowed without admin auth.
  // The void action and admin-initiated re-signs require admin auth.
  // The DB-level sign_lease() and sign_lease_co_applicant() functions enforce
  // their own guards (expiry, void check, duplicate signature) independently.
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  let body: any = {}
  try { body = await req.json() } catch (_) {
    return new Response(JSON.stringify({ success: false, error: 'Invalid JSON body' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  const { app_id, signature, ip_address, is_co_applicant, co_token, action } = body

  // ── Admin-only actions: void ─────────────────────────────
  const requiresAdmin = action === 'void'
  if (requiresAdmin) {
    const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!jwt) return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } })
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
    const { data: { user }, error: authErr } = await authClient.auth.getUser(jwt)
    if (authErr || !user) return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } })
    const supabaseCheck = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: adminRow } = await supabaseCheck.from('admin_roles').select('id').eq('user_id', user.id).maybeSingle()
    if (!adminRow) return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  try {
    // ── Void lease action (admin-only, guarded above) ────────
    if (action === 'void') {
      if (!app_id) throw new Error('app_id required')
      const { error } = await supabase.from('applications').update({ lease_status: 'voided' }).eq('app_id', app_id)
      if (error) throw new Error(error.message)
      return new Response(JSON.stringify({ success: true }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    // ── Normal sign flow ────────────────────────────────────
    if (!app_id || !signature) throw new Error('app_id and signature required')

    // ── Co-applicant token validation ───────────────────────
    if (is_co_applicant) {
      const { data: tokenCheck } = await supabase
        .from('applications')
        .select('co_applicant_lease_token, has_co_applicant')
        .eq('app_id', app_id)
        .single()
      if (!tokenCheck?.has_co_applicant) throw new Error('No co-applicant on this application')
      // If a token exists on the record, the incoming token must match
      if (tokenCheck.co_applicant_lease_token && tokenCheck.co_applicant_lease_token !== co_token) {
        throw new Error('Invalid co-applicant signing link. Please use the link sent to your email address.')
      }
    }

    // ── Sign via DB function ────────────────────────────────
    const fn = is_co_applicant ? 'sign_lease_co_applicant' : 'sign_lease'
    const { data, error } = await supabase.rpc(fn, { p_app_id: app_id, p_signature: signature, p_ip: ip_address || '' })
    if (error) throw new Error(error.message)
    if (!data?.success) throw new Error(data?.error || 'Sign failed')

    // ── Fetch full updated application ──────────────────────
    const { data: app } = await supabase.from('applications').select('*').eq('app_id', app_id).single()

    const fullyExecuted = !app.has_co_applicant
      ? (app.lease_status === 'signed')
      : (app.lease_status === 'co_signed')

    // ── Generate + upload signed lease HTML ─────────────────
    // Bucket is PRIVATE. We store only the file PATH (not a time-limited signed URL).
    // Signed URLs are generated on-demand when the tenant views their dashboard,
    // via the get_application_status() DB function — so they never expire in the DB.
    let pdfUrl: string | null = null
    if (fullyExecuted) {
      try {
        const leaseHtml = buildLeaseHTML(app)
        const htmlBytes = new TextEncoder().encode(leaseHtml)
        const fileName  = `lease-${app_id}-signed.html`
        const { error: uploadErr } = await supabase.storage
          .from('lease-pdfs')
          .upload(fileName, htmlBytes, { contentType: 'text/html', upsert: true })
        if (!uploadErr) {
          // Store the storage PATH only — not a signed URL.
          // get_application_status() will generate a fresh signed URL on each dashboard load.
          const storagePath = fileName
          await supabase.from('applications').update({ lease_pdf_url: storagePath }).eq('app_id', app_id)
          // Generate a one-time signed URL for the confirmation email (7 days, enough for the email)
          const { data: signedData } = await supabase.storage
            .from('lease-pdfs')
            .createSignedUrl(fileName, 604800)
          pdfUrl = signedData?.signedUrl || null  // used only in the email below
        }
      } catch (_) { /* non-fatal — signing already succeeded */ }
    }

    // ── Emails ──────────────────────────────────────────────
    const dashboardUrl = Deno.env.get('DASHBOARD_URL') || ''
    const gasUrl       = Deno.env.get('GAS_EMAIL_URL')!
    const secret       = Deno.env.get('GAS_RELAY_SECRET')

    const leaseData = {
      property:      app.property_address,
      start_date:    app.lease_start_date,
      end_date:      app.lease_end_date,
      rent:          app.monthly_rent,
      move_in_costs: app.move_in_costs,
      signature,
      pdf_url:       pdfUrl,  // now real
    }

    if (fullyExecuted) {
      // Tenant confirmation — now includes real pdf_url
      fetch(gasUrl, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ secret, template:'lease_signed_tenant', to: app.email, cc: null,
          data:{ app_id, first_name: app.first_name, preferred_language: app.preferred_language || 'en', ...leaseData } })
      }).then(async (r) => {
        const json = await r.json().catch(() => ({}))
        const ok = r.ok && json.success !== false
        await supabase.from('email_logs').insert({ type:'lease_signed_tenant', recipient: app.email, status: ok ? 'sent' : 'failed', app_id, error_msg: ok ? null : (json.error || `HTTP ${r.status}`) })
      }).catch(async (e) => {
        await supabase.from('email_logs').insert({ type:'lease_signed_tenant', recipient: app.email, status:'failed', app_id, error_msg: e?.message || 'Network error' })
      })

      // Co-applicant confirmation if they signed last
      if (is_co_applicant && app.co_applicant_email) {
        fetch(gasUrl, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ secret, template:'lease_signed_tenant', to: app.co_applicant_email, cc: null,
            data:{ app_id, first_name: app.co_applicant_first_name || 'Co-Applicant', preferred_language: app.preferred_language || 'en', ...leaseData } })
        }).catch(() => {})

        // Also notify the primary applicant that both parties have now signed
        fetch(gasUrl, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ secret, template:'lease_signed_tenant', to: app.email, cc: null,
            data:{ app_id, first_name: app.first_name, preferred_language: app.preferred_language || 'en', ...leaseData } })
        }).then(async (r) => {
          const json = await r.json().catch(() => ({}))
          const ok = r.ok && json.success !== false
          await supabase.from('email_logs').insert({ type:'lease_cosign_primary_notify', recipient: app.email, status: ok ? 'sent' : 'failed', app_id, error_msg: ok ? null : (json.error || `HTTP ${r.status}`) })
        }).catch(async (e) => {
          await supabase.from('email_logs').insert({ type:'lease_cosign_primary_notify', recipient: app.email, status:'failed', app_id, error_msg: e?.message || 'Network error' })
        })
      }

      // Admin alert
      fetch(gasUrl, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ secret, template:'lease_signed_admin', to: null,
          data:{ app_id, tenant_name:`${app.first_name} ${app.last_name}`, email: app.email, phone: app.phone, signature, property: app.property_address } })
      }).then(async (r) => {
        const json = await r.json().catch(() => ({}))
        const ok = r.ok && json.success !== false
        await supabase.from('email_logs').insert({ type:'lease_signed_admin', recipient:'admin', status: ok ? 'sent' : 'failed', app_id, error_msg: ok ? null : (json.error || `HTTP ${r.status}`) })
      }).catch(async (e) => {
        await supabase.from('email_logs').insert({ type:'lease_signed_admin', recipient:'admin', status:'failed', app_id, error_msg: e?.message || 'Network error' })
      })

    } else if (!is_co_applicant && app.has_co_applicant && app.lease_status === 'awaiting_co_sign') {
      // Primary signed — nudge co-applicant to sign via their token link
      const coName     = app.co_applicant_first_name || 'Co-Applicant'
      const coLeaseLink = `${dashboardUrl}/apply/lease.html?id=${app_id}&co_token=${app.co_applicant_lease_token}`
      fetch(gasUrl, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ secret, template:'lease_sent_co_applicant', to: app.co_applicant_email, cc: null,
          data:{
            app_id, primary_name: `${app.first_name} ${app.last_name}`,
            tenant_name: coName, lease_link: coLeaseLink,
            preferred_language: app.preferred_language || 'en',
            property: app.property_address, term: app.desired_lease_term || '12 Months',
            startDate: fmtDate(app.lease_start_date), endDate: fmtDate(app.lease_end_date),
            rent: app.monthly_rent, deposit: app.security_deposit, move_in_costs: app.move_in_costs,
          }
        })
      }).then(async (r) => {
        const json = await r.json().catch(() => ({}))
        const ok = r.ok && json.success !== false
        await supabase.from('email_logs').insert({ type:'lease_nudge_co_applicant', recipient: app.co_applicant_email, status: ok ? 'sent' : 'failed', app_id, error_msg: ok ? null : (json.error || `HTTP ${r.status}`) })
      }).catch(async (e) => {
        await supabase.from('email_logs').insert({ type:'lease_nudge_co_applicant', recipient: app.co_applicant_email, status:'failed', app_id, error_msg: e?.message || 'Network error' })
      })
    }

    return new Response(JSON.stringify({ success: true, pdf_url: pdfUrl }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})
