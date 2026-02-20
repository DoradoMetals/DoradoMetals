// features/stripe/client.ts
import "dotenv/config";
import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) throw new Error("Missing STRIPE_SECRET_KEY");

const stripeClient = new Stripe(secretKey, {
});

export default stripeClient;