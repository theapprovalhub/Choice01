-- ============================================================
-- CHOICE PROPERTIES — Security Patches
-- Run this ONCE in Supabase SQL Editor after running SCHEMA.sql
-- ============================================================


-- ── 1. Revert lease-pdfs bucket to PRIVATE ─────────────────
UPDATE storage.buckets
  SET public = false
  WHERE id = 'lease-pdfs';

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'lease_pdfs_read_public'
  ) THEN
    EXECUTE 'DROP POLICY "lease_pdfs_read_public" ON storage.objects';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'lease_pdfs_read_auth'
  ) THEN
    EXECUTE 'CREATE POLICY "lease_pdfs_read_auth" ON storage.objects
             FOR SELECT TO authenticated
             USING (bucket_id = ''lease-pdfs'')';
  END IF;
END $$;


-- ── 2. Mask any existing SSNs already in the database ───────
UPDATE applications
  SET ssn = 'XXX-XX-' || right(regexp_replace(ssn, '\D', '', 'g'), 4)
  WHERE ssn IS NOT NULL
    AND ssn NOT LIKE 'XXX-XX-%'
    AND length(regexp_replace(ssn, '\D', '', 'g')) >= 4;

UPDATE applications
  SET co_applicant_ssn = 'XXX-XX-' || right(regexp_replace(co_applicant_ssn, '\D', '', 'g'), 4)
  WHERE co_applicant_ssn IS NOT NULL
    AND co_applicant_ssn NOT LIKE 'XXX-XX-%'
    AND length(regexp_replace(co_applicant_ssn, '\D', '', 'g')) >= 4;


-- ── 3. Add SECURITY INVOKER to admin view ───────────────────
DROP VIEW IF EXISTS admin_application_view;

CREATE VIEW admin_application_view WITH (security_invoker=on) AS
  SELECT
    a.id,
    a.app_id,
    a.created_at,
    a.updated_at,
    a.status,
    a.payment_status,
    a.payment_date,
    a.admin_notes,
    a.first_name,
    a.last_name,
    a.email,
    a.phone,
    a.property_address,
    a.property_id,
    a.landlord_id,
    a.lease_status,
    a.lease_sent_date,
    a.lease_signed_date,
    a.lease_start_date,
    a.lease_end_date,
    a.monthly_rent,
    a.security_deposit,
    a.move_in_costs,
    a.lease_late_fee_flat,
    a.lease_late_fee_daily,
    a.lease_expiry_date,
    a.tenant_signature,
    a.co_applicant_signature,
    a.has_co_applicant,
    a.co_applicant_first_name,
    a.co_applicant_last_name,
    a.co_applicant_email,
    a.move_in_status,
    a.move_in_date_actual,
    a.move_in_notes,
    a.primary_payment_method,
    a.alternative_payment_method,
    a.third_choice_payment_method,
    a.employment_status,
    a.employer,
    a.monthly_income,
    l.contact_name  AS landlord_name,
    l.business_name AS landlord_business,
    p.title         AS property_title,
    p.city          AS property_city,
    p.state         AS property_state
  FROM applications a
  LEFT JOIN landlords l ON a.landlord_id = l.id
  LEFT JOIN properties p ON a.property_id = p.id;


-- ── 4. Ensure app_id uniqueness ─────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'applications_app_id_unique'
  ) THEN
    ALTER TABLE applications
      ADD CONSTRAINT applications_app_id_unique UNIQUE (app_id);
  END IF;
END $$;


-- ── 5. Done ─────────────────────────────────────────────────
SELECT 'Security patches applied successfully.' AS result;


-- ── 5. Explicit WITH CHECK on properties_landlord_write ─────
-- For INSERT statements, Postgres evaluates WITH CHECK, not USING.
-- The previous policy had no WITH CHECK, so inserts relied on implicit
-- permissive fallback. This makes the constraint explicit and secure.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'properties'
      AND policyname = 'properties_landlord_write'
  ) THEN
    EXECUTE 'DROP POLICY "properties_landlord_write" ON properties';
  END IF;
END $$;

CREATE POLICY "properties_landlord_write" ON properties
  FOR ALL USING (
    landlord_id = (SELECT id FROM landlords WHERE user_id = auth.uid())
  )
  WITH CHECK (
    landlord_id = (SELECT id FROM landlords WHERE user_id = auth.uid())
  );
