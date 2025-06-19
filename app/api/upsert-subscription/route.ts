import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer as supabase } from '../../../utils/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const { userId, status = 'active' } = await req.json();
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    // Use upsert to create subscription if it doesn't exist, or do nothing if it exists
    const { error } = await supabase
      .from('subscription')
      .upsert({
        user_id: userId,
        status,
      }, {
        onConflict: 'user_id' // Assuming user_id is unique
      });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
} 