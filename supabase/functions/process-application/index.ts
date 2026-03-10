// Choice Properties — Edge Function: process-application
// Receives application form POST, saves to Supabase, fires emails via GAS relay

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const formData = await req.json()

    // ── Duplicate submission guard ────────────────────────
    // Two checks:
    //   A) Active application (pending/under_review/approved) for same email+property — show recovery banner
    //   B) Hard block: same email+property submitted within 24 hours — prevents spam
    const submittedEmail    = (formData['Email'] || formData.email || '').toLowerCase().trim()
    const submittedProperty = formData.listing_property_id || null
    const submittedAddress  = (formData['Property Address'] || formData.property_address || '').trim()

    if (submittedEmail) {
      // Check A: active application for same email + property (by ID or address)
      if (submittedProperty || submittedAddress) {
        let activeQuery = supabase
          .from('applications')
          .select('app_id, status, created_at')
          .ilike('email', submittedEmail)
          .in('status', ['pending', 'under_review', 'approved'])
          .order('created_at', { ascending: false })
          .limit(1)
        if (submittedProperty) {
          activeQuery = activeQuery.eq('property_id', submittedProperty)
        } else {
          activeQuery = activeQuery.ilike('property_address', submittedAddress)
        }
        const { data: activeApp } = await activeQuery
        if (activeApp && activeApp.length > 0) {
          return new Response(
            JSON.stringify({
              success: false,
              duplicate: true,
              existing_app_id: activeApp[0].app_id,
              error: 'You already have an active application for this property.',
            }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }

      // Check B: hard block — same email+property within 24 hours (spam prevention)
      const oneDayAgo = new Date(Date.now() - 86400000).toISOString()
      let recentQuery = supabase
        .from('applications')
        .select('app_id')
        .eq('email', submittedEmail)
        .gte('created_at', oneDayAgo)
      if (submittedProperty) recentQuery = recentQuery.eq('property_id', submittedProperty)
      const { data: recentApp } = await recentQuery.limit(1)
      if (recentApp && recentApp.length > 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'A recent application from this email already exists. Please wait 24 hours before reapplying, or contact us if you need help.',
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Generate app_id
    const { data: appIdRow } = await supabase.rpc('generate_app_id')
    const appId = appIdRow || `CP-${Date.now()}`

    // ── Security: Mask SSN to last-4 digits only ──────────
    // Full SSNs must never be stored in plain text.
    // We keep only the last 4 for identity reference.
    function maskSSN(raw: any): string | null {
      if (!raw) return null
      const digits = String(raw).replace(/\D/g, '')
      if (digits.length < 4) return null
      return 'XXX-XX-' + digits.slice(-4)
    }
    formData['SSN']              = maskSSN(formData['SSN']              || formData.ssn)
    formData['Co-Applicant SSN'] = maskSSN(formData['Co-Applicant SSN'] || formData.co_applicant_ssn)
    formData.ssn                 = formData['SSN']
    formData.co_applicant_ssn    = formData['Co-Applicant SSN']

    // ── Build application record ──────────────────────────
    const record = {
      app_id:                           appId,
      status:                           'pending',
      payment_status:                   'unpaid',
      lease_status:                     'none',
      application_fee:                  parseInt(formData.application_fee) || 0,
      property_id:                      formData.listing_property_id || null,
      landlord_id:                      formData.landlord_id || null,
      property_address:                 formData['Property Address'] || formData.property_address || '',
      first_name:                       formData['First Name'] || formData.first_name || '',
      last_name:                        formData['Last Name'] || formData.last_name || '',
      email:                            formData['Email'] || formData.email || '',
      phone:                            formData['Phone'] || formData.phone || '',
      dob:                              formData['DOB'] || formData.dob || null,
      ssn:                              formData['SSN'] || formData.ssn || null,
      requested_move_in_date:           formData['Requested Move-in Date'] || formData.requested_move_in_date || null,
      desired_lease_term:               formData['Desired Lease Term'] || formData.desired_lease_term || null,
      current_address:                  formData['Current Address'] || formData.current_address || null,
      residency_duration:               formData['Residency Duration'] || formData.residency_duration || null,
      current_rent_amount:              formData['Current Rent Amount'] || formData.current_rent_amount || null,
      reason_for_leaving:               formData['Reason for leaving'] || formData.reason_for_leaving || null,
      current_landlord_name:            formData['Current Landlord Name'] || formData.current_landlord_name || null,
      landlord_phone:                   formData['Landlord Phone'] || formData.landlord_phone || null,
      employment_status:                formData['Employment Status'] || formData.employment_status || null,
      employer:                         formData['Employer'] || formData.employer || null,
      job_title:                        formData['Job Title'] || formData.job_title || null,
      employment_duration:              formData['Employment Duration'] || formData.employment_duration || null,
      supervisor_name:                  formData['Supervisor Name'] || formData.supervisor_name || null,
      supervisor_phone:                 formData['Supervisor Phone'] || formData.supervisor_phone || null,
      monthly_income:                   formData['Monthly Income'] || formData.monthly_income || null,
      other_income:                     formData['Other Income'] || formData.other_income || null,
      reference_1_name:                 formData['Reference 1 Name'] || formData.reference_1_name || null,
      reference_1_phone:                formData['Reference 1 Phone'] || formData.reference_1_phone || null,
      reference_2_name:                 formData['Reference 2 Name'] || formData.reference_2_name || null,
      reference_2_phone:                formData['Reference 2 Phone'] || formData.reference_2_phone || null,
      emergency_contact_name:           formData['Emergency Contact Name'] || formData.emergency_contact_name || null,
      emergency_contact_phone:          formData['Emergency Contact Phone'] || formData.emergency_contact_phone || null,
      emergency_contact_relationship:   formData['Emergency Contact Relationship'] || formData.emergency_contact_relationship || null,
      primary_payment_method:           formData['Primary Payment Method'] || formData.primary_payment_method || null,
      primary_payment_method_other:     formData['Primary Payment Method Other'] || formData.primary_payment_method_other || null,
      alternative_payment_method:       formData['Alternative Payment Method'] || formData.alternative_payment_method || null,
      alternative_payment_method_other: formData['Alternative Payment Method Other'] || formData.alternative_payment_method_other || null,
      third_choice_payment_method:      formData['Third Choice Payment Method'] || formData.third_choice_payment_method || null,
      third_choice_payment_method_other:formData['Third Choice Payment Method Other'] || formData.third_choice_payment_method_other || null,
      has_pets:                         formData['Has Pets'] === 'Yes' || formData.has_pets === true,
      pet_details:                      formData['Pet Details'] || formData.pet_details || null,
      total_occupants:                  formData['Total Occupants'] || formData.total_occupants || null,
      additional_occupants:             formData['Additional Occupants'] || formData.additional_occupants || null,
      ever_evicted:                     formData['Ever Evicted'] === 'Yes' || formData.ever_evicted === true,
      smoker:                           formData['Smoker'] === 'Yes' || formData.smoker === true,
      preferred_language:                formData.preferred_language || 'en',
      preferred_contact_method:         Array.isArray(formData['Preferred Contact Method']) ? formData['Preferred Contact Method'].join(', ') : (formData.preferred_contact_method || null),
      preferred_time:                   Array.isArray(formData['Preferred Time']) ? formData['Preferred Time'].join(', ') : (formData.preferred_time || null),
      preferred_time_specific:          formData['Preferred Time Specific'] || formData.preferred_time_specific || null,
      vehicle_make:                     formData['Vehicle Make'] || formData.vehicle_make || null,
      vehicle_model:                    formData['Vehicle Model'] || formData.vehicle_model || null,
      vehicle_year:                     formData['Vehicle Year'] || formData.vehicle_year || null,
      vehicle_license_plate:            formData['Vehicle License Plate'] || formData.vehicle_license_plate || null,
      has_co_applicant:                 formData['Has Co-Applicant'] === 'Yes' || formData.has_co_applicant === true,
      additional_person_role:           formData['Additional Person Role'] || formData.additional_person_role || null,
      co_applicant_first_name:          formData['Co-Applicant First Name'] || formData.co_applicant_first_name || null,
      co_applicant_last_name:           formData['Co-Applicant Last Name'] || formData.co_applicant_last_name || null,
      co_applicant_email:               formData['Co-Applicant Email'] || formData.co_applicant_email || null,
      co_applicant_phone:               formData['Co-Applicant Phone'] || formData.co_applicant_phone || null,
      co_applicant_dob:                 formData['Co-Applicant DOB'] || formData.co_applicant_dob || null,
      co_applicant_ssn:                 formData['Co-Applicant SSN'] || formData.co_applicant_ssn || null,
      co_applicant_employer:            formData['Co-Applicant Employer'] || formData.co_applicant_employer || null,
      co_applicant_job_title:           formData['Co-Applicant Job Title'] || formData.co_applicant_job_title || null,
      co_applicant_monthly_income:      formData['Co-Applicant Monthly Income'] || formData.co_applicant_monthly_income || null,
      co_applicant_employment_duration: formData['Co-Applicant Employment Duration'] || formData.co_applicant_employment_duration || null,
      co_applicant_consent:             formData['Co-Applicant Consent'] === true || formData.co_applicant_consent === true,
      document_url:                     formData.document_url || null,
    }

    // Insert application
    const { error: insertError } = await supabase
      .from('applications')
      .insert(record)

    if (insertError) throw new Error(`DB insert failed: ${insertError.message}`)

    // Log email attempt
    await supabase.from('email_logs').insert({ type: 'application_confirmation', recipient: record.email, status: 'pending', app_id: appId })

    // Fire emails via GAS relay (non-blocking)
    const gasUrl    = Deno.env.get('GAS_EMAIL_URL')!
    const gasSecret = Deno.env.get('GAS_RELAY_SECRET')!

    // Sanitized payload — only what email templates actually need
    // Never send SSN, DOB, employer, income, references, or emergency contacts to GAS relay
    const emailPayload = {
      app_id:              appId,
      first_name:          record.first_name,
      last_name:           record.last_name,
      email:               record.email,
      phone:               record.phone,
      property_address:    record.property_address,
      requested_move_in:   record.requested_move_in_date || 'Not specified',
      desired_lease_term:  record.desired_lease_term     || 'Not specified',
    }

    // Applicant confirmation
    fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: gasSecret, template: 'application_confirmation', to: record.email, data: emailPayload })
    }).then(async (r) => {
      const json = await r.json().catch(() => ({}))
      const ok = r.ok && json.success !== false
      await supabase.from('email_logs').insert({ type: 'application_confirmation', recipient: record.email, status: ok ? 'success' : 'failed', app_id: appId, error_msg: ok ? null : (json.error || `HTTP ${r.status}`) })
    }).catch(async (e) => {
      await supabase.from('email_logs').insert({ type: 'application_confirmation', recipient: record.email, status: 'failed', app_id: appId, error_msg: e?.message || 'Network error' })
    })

    // Admin notification — pass admin email from env secrets
    const adminEmail = Deno.env.get('ADMIN_EMAIL') || Deno.env.get('ADMIN_EMAILS') || null;
    fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: gasSecret, template: 'admin_notification', to: adminEmail, data: emailPayload })
    }).then(async (r) => {
      const json = await r.json().catch(() => ({}))
      const ok = r.ok && json.success !== false
      await supabase.from('email_logs').insert({ type: 'admin_notification', recipient: adminEmail || 'admin', status: ok ? 'success' : 'failed', app_id: appId, error_msg: ok ? null : (json.error || `HTTP ${r.status}`) })
    }).catch(async (e) => {
      await supabase.from('email_logs').insert({ type: 'admin_notification', recipient: adminEmail || 'admin', status: 'failed', app_id: appId, error_msg: e?.message || 'Network error' })
    })

    // Landlord notification — look up the landlord's email via the property
    if (record.property_id) {
      const { data: propRow } = await supabase
        .from('properties')
        .select('landlords(email, contact_name, business_name)')
        .eq('id', record.property_id)
        .single()
      const landlordEmail = (propRow as any)?.landlords?.email
      const landlordName  = (propRow as any)?.landlords?.business_name || (propRow as any)?.landlords?.contact_name || 'Landlord'
      if (landlordEmail) {
        fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            secret: gasSecret,
            template: 'landlord_notification',
            to: landlordEmail,
            data: {
              ...emailPayload,
              landlordName,
              app_id: appId,
              applicantName: `${record.first_name} ${record.last_name}`,
              propertyAddress: record.property_address,
            }
          })
        }).then(async (r) => {
          const json = await r.json().catch(() => ({}))
          const ok = r.ok && json.success !== false
          await supabase.from('email_logs').insert({ type: 'landlord_notification', recipient: landlordEmail, status: ok ? 'success' : 'failed', app_id: appId, error_msg: ok ? null : (json.error || `HTTP ${r.status}`) })
        }).catch(async (e) => {
          await supabase.from('email_logs').insert({ type: 'landlord_notification', recipient: landlordEmail, status: 'failed', app_id: appId, error_msg: e?.message || 'Network error' })
        })
      }
    }

    return new Response(JSON.stringify({ success: true, app_id: appId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
