import 'dotenv/config';
import Stripe from 'stripe';

const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);

export default stripeClient;