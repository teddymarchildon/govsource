import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/utils/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-05-28.basil' });

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const profileUrl = new URL('/profile', req.nextUrl.origin).toString();
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: 'price_1RnJM4FHp5a6uQihntepfOIg', quantity: 1 }],
      success_url: profileUrl,
      cancel_url: profileUrl,
      client_reference_id: user.id,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    console.error('Error creating checkout session:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to create checkout session' }, { status: 500 });
  }
}
