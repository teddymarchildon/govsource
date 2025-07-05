import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-05-28.basil' });

export async function POST(req: NextRequest) {
  const { userId, redirectUrl } = await req.json();

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: 'price_1RXqViFHp5a6uQihQFgBJKBH', quantity: 1 }],
      success_url: redirectUrl || 'https://govsrc.com/profile',
      cancel_url: redirectUrl || 'https://govsrc.com/profile',
      client_reference_id: userId,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('Error creating checkout session:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
