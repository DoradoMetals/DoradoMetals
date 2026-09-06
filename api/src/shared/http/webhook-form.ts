// A signature-verified webhook's parsed form body (Twilio, Stripe, ...):
// every field arrives as a string. Named so a domain file can take one as a
// parameter without spelling out an index-signature type itself.
export type WebhookForm = Record<string, string>
