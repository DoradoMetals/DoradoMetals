// The Stripe SDK client.
//
// Moved here from features/stripe because Stripe is a provider, not a feature -
// the same distinction providers/fedex already made. A feature is something the
// business does; a provider is a third party it does it through. What was
// features/stripe was both at once: the payments domain AND the SDK it happens
// to use.
//
// features/payments owns the domain. This owns the connection.
import "#env";
import Stripe from "stripe";

const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);

export default stripeClient;
