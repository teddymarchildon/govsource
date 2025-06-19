import { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '../../../utils/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-05-28.basil' });

export async function POST(req: NextRequest) {
  const supabase = await createClient()
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

  // Upsert subscription
  async function upsertSubscription(subscription: any) {
    // Find user by stripe_customer_id
    const { data: userSub } = await supabase
      .from('subscription')
      .select('user_id')
      .eq('stripe_customer_id', subscription.customer)
      .maybeSingle();

    await supabase.from('subscription').upsert({
      stripe_customer_id: subscription.customer,
      stripe_subscription_id: subscription.id,
      stripe_price_id: subscription.items?.data?.[0]?.price?.id,
      status: subscription.status,
      current_period_end: subscription.current_period?.end
        ? new Date(subscription.current_period.end * 1000).toISOString()
        : null,
      cancel_at_period_end: subscription.cancel_at_period_end,
      user_id: userSub?.user_id,
    }, { onConflict: 'stripe_subscription_id' });
  }

  // Upsert payment
  async function upsertPayment(invoice: any) {
    // Find subscription row by stripe_subscription_id
    const { data: subscription } = await supabase
      .from('subscription')
      .select('id,user_id')
      .eq('stripe_subscription_id', invoice.subscription)
      .maybeSingle();

    await supabase.from('payment').upsert({
      stripe_invoice_id: invoice.id,
      amount: invoice.amount_paid,
      currency: invoice.currency,
      status: invoice.status,
      paid_at: invoice.status === 'paid' && invoice.status_transitions?.paid_at
        ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
        : null,
      user_id: subscription?.user_id,
      subscription_id: subscription?.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'stripe_invoice_id' });
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as any;
        const userId = session.client_reference_id;
        const stripeCustomerId = session.customer;
        if (userId && stripeCustomerId) {
          // Upsert the mapping in the subscription table
          await supabase.from('subscription').upsert({
            user_id: userId,
            stripe_customer_id: stripeCustomerId,
            stripe_subscription_id: session.subscription,
            status: 'active',
            cancel_at_period_end: false,
            tier: 'paid',
          }, { onConflict: 'stripe_customer_id' });
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await upsertSubscription(subscription);
        break;
      }
      case 'invoice.paid':
      case 'invoice.payment_failed':
      case 'invoice.created': {
        const invoice = event.data.object as Stripe.Invoice;
        await upsertPayment(invoice);
        break;
      }
      default:
        return new Response('Unknown event type', { status: 500 });
    }
  } catch (err) {
    console.error('Error handling Stripe webhook event:', err);
    return new Response('Webhook handler error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
}
