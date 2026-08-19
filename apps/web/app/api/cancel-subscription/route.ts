import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '../../../utils/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-05-28.basil' });

export async function POST() {
  const supabase = await createClient();

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('subscription')
      .select('stripe_subscription_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw error;
    if (!data?.stripe_subscription_id) {
      return NextResponse.json({ error: 'No active subscription found for user.' }, { status: 404 });
    }

    const subscriptionId = data.stripe_subscription_id;

    // Cancel the subscription at period end in Stripe
    const stripeSub = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
    const stripeSubData = stripeSub.items.data[0]

    // Update the subscription row in Supabase
    await supabase
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
  } catch (err: unknown) {
    console.error('Error cancelling subscription:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to cancel subscription.' }, { status: 500 });
  }
}
