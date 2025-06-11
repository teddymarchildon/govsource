import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseServer } from '../../../lib/supabase-server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-05-28.basil' });

export async function POST(req: NextRequest) {
  const { userId, stripeSubscriptionId } = await req.json();

  let subscriptionId = stripeSubscriptionId;

  try {
    // If userId is provided, look up the subscription in Supabase
    if (!subscriptionId && userId) {
      const { data, error } = await supabaseServer
        .from('subscription')
        .select('stripe_subscription_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data || !data.stripe_subscription_id) {
        return NextResponse.json({ error: 'No active subscription found for user.' }, { status: 404 });
      }
      subscriptionId = data.stripe_subscription_id;
    }

    if (!subscriptionId) {
      return NextResponse.json({ error: 'Missing stripeSubscriptionId or userId.' }, { status: 400 });
    }

    // Cancel the subscription at period end in Stripe
    const stripeSub = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
    const stripeSubData = stripeSub.items.data[0]

    // Update the subscription row in Supabase
    await supabaseServer
      .from('subscription')
      .update({
        cancel_at_period_end: true,
        status: stripeSub.status,
        current_period_end: stripeSubData.current_period_end
          ? new Date(stripeSubData.current_period_end * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_subscription_id', subscriptionId);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Error cancelling subscription:', err);
    return NextResponse.json({ error: err.message || 'Failed to cancel subscription.' }, { status: 500 });
  }
}
