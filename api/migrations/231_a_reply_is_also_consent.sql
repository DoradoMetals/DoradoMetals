-- Ruling 112: no refusal on business judgment, so texting a customer or lead
-- with no consent on file is allowed. What 229/230 need instead is a third
-- way consent arrives: a reply to our own opt-in request. The CHECK
-- constraints from those migrations only knew web_form and verbal.
--
-- Purely additive. `exchange` is neither read nor written.

ALTER TABLE auth.users DROP CONSTRAINT IF EXISTS users_sms_consent_method_is_known;
ALTER TABLE auth.users ADD CONSTRAINT users_sms_consent_method_is_known
  CHECK (sms_consent_method IS NULL OR sms_consent_method IN ('web_form', 'verbal', 'via_text'));

ALTER TABLE leads.leads DROP CONSTRAINT IF EXISTS leads_sms_consent_method_is_known;
ALTER TABLE leads.leads ADD CONSTRAINT leads_sms_consent_method_is_known
  CHECK (sms_consent_method IS NULL OR sms_consent_method IN ('web_form', 'verbal', 'via_text'));
