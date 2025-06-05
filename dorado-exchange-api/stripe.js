const { Stripe } = require("stripe");
require("dotenv").config();

const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = {
  stripeClient
};
