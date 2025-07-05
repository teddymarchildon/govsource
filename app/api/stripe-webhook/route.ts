import { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '../../../utils/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-05-28.basil',
});

export async function POST(req: NextRequest) {
  const supabase = await createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
  const buf = Buffer.from(await req.arrayBuffer());
  const sig = req.headers.get('stripe-signature') as string;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed.', err);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as any;
        const userId = session.client_reference_id;
        const stripeCustomerId = session.customer;
        const stripeSubscriptionId = session.subscription;

        let priceId: string | undefined = undefined;
        if (stripeSubscriptionId) {
          const stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
          priceId = stripeSub.items.data[0]?.price.id;
        }

        if (userId && stripeCustomerId) {
          await supabase
            .from('subscription')
            .update({
              stripe_customer_id: stripeCustomerId,
              stripe_subscription_id: stripeSubscriptionId,
              stripe_price_id: priceId,
              status: 'active',
              tier: 'paid',
            })
            .eq('user_id', userId)
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.customer) {
          await supabase
            .from('subscription')
            .update({
              status: 'payment_failure',
              tier: 'free',
            })
            .eq('stripe_customer_id', invoice.customer);
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await supabase
          .from('subscription')
          .update({
            status: 'canceled',
            tier: 'free',
            canceled_at: subscription.canceled_at
              ? new Date(subscription.canceled_at * 1000).toISOString()
              : new Date().toISOString(),
          })
          .eq('stripe_customer_id', subscription.customer);
        break;
      }
      case 'customer.subscription.created': {
        const subscription = event.data.object as Stripe.Subscription;
        const priceId = subscription.items.data[0]?.price.id;
        let trialEndsAt: string | null = null;
        let status = 'active';
        if (subscription.trial_end) {
          trialEndsAt = new Date(subscription.trial_end * 1000).toISOString();
          status = 'trialing';
        }
        await supabase
          .from('subscription')
          .update({
            tier: 'paid',
            stripe_price_id: priceId,
            stripe_subscription_id: subscription.id,
            trial_ends_at: trialEndsAt,
            status,
            has_used_trial: status === 'trialing' ? true : false,
          })
          .eq('stripe_customer_id', subscription.customer);
        break;
      }
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error('Error handling Stripe webhook event:', err);
    return new Response('Webhook handler error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
}
