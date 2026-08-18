import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../utils/supabase/server';

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  try {
    await req.json().catch(() => ({}));
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { error } = await supabase
      .from('subscription')
      .upsert({
        user_id: user.id,
        status: 'active',
        tier: 'free',
      }, {
        onConflict: 'user_id',
        ignoreDuplicates: true,
      });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
