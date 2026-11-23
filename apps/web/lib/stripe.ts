import type Stripe from 'stripe';

// Pinned to the API version the account and webhook endpoint were built against.
// stripe-node's types only accept its newest version, so the cast keeps the pin
// until the payloads are migrated deliberately.
export const STRIPE_API_VERSION = '2025-05-28.basil' as Stripe.StripeConfig['apiVersion'];
