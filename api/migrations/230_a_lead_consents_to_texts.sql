-- Mirrors 229 for leads.leads: a lead can consent before ever becoming a
-- customer, either through the public lead/sell form (web_form, stamped when
-- the body carries sms_consent: true) or verbally, when a staff member reads
-- the script on a call and marks it on the admin PATCH. Either way the
-- timestamp is server-stamped, never a client-supplied value.
--
-- Converting a lead copies both columns onto the new auth.users row -
-- accounts/users/service.ts createFromLead - so a customer's consent history
-- survives the conversion.
--
-- Purely additive. `exchange` is neither read nor written.

ALTER TABLE leads.leads
  ADD COLUMN IF NOT EXISTS sms_consent_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS sms_consent_method text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'leads_sms_consent_method_is_known'
       AND conrelid = 'leads.leads'::regclass
  ) THEN
    ALTER TABLE leads.leads ADD CONSTRAINT leads_sms_consent_method_is_known
      CHECK (sms_consent_method IS NULL OR sms_consent_method IN ('web_form', 'verbal'));
  END IF;
END $$;
