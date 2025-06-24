import { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '../../../utils/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-05-28.basil',
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
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
        console.log('userId', userId);
        console.log('stripeCustomerId', stripeCustomerId);
        if (userId && stripeCustomerId) {
          // Try to update
          const { data, error } = await supabase
            .from('subscription')
            .update({
              stripe_customer_id: stripeCustomerId,
              stripe_subscription_id: session.subscription,
              status: 'active',
              tier: 'paid',
            })
            .eq('user_id', userId)
            .select('*');

          if (error) {
            console.error('Supabase update error:', error);
          } else if (!data || data.length === 0) {
            console.warn(`No subscription row found for user_id: ${userId}`);
            // Optionally, insert a new row here if that's expected
          } else {
            console.log(`Updated subscription for user_id: ${userId}`);
          }
        } else {
          console.warn('Missing userId or stripeCustomerId in session:', { userId, stripeCustomerId });
        }
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.customer) {
          await supabase
            .from('subscription')
            .update({
              status: 'active',
              tier: 'paid',
            })
            .eq('stripe_customer_id', invoice.customer);
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
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error('Error handling Stripe webhook event:', err);
    return new Response('Webhook handler error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
}
