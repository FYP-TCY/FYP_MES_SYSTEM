// Siemens PLC sends HTTP POST to this endpoint every N seconds.
// Body (JSON): { machine_code, length_m, speed_mpm? }
//
// The PLC just needs an HTTP POST block — no session ID needed;
// this route finds the active session for that machine automatically.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Use service-role key so PLC calls bypass RLS
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  // Basic auth check: PLC must send a shared secret header
  const authHeader = req.headers.get('x-plc-secret')
  if (authHeader !== process.env.PLC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { machine_code?: string; length_m?: number; speed_mpm?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { machine_code, length_m, speed_mpm } = body

  if (!machine_code || length_m === undefined) {
    return NextResponse.json(
      { error: 'machine_code and length_m are required' },
      { status: 422 }
    )
  }

  // Find the active session for this machine
  const { data: session, error: sessionErr } = await supabase
    .from('machine_sessions')
    .select('id')
    .eq('machine_code', machine_code)
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (sessionErr) {
    console.error('Session lookup error:', sessionErr)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  // Insert reading (even with no session, so we have raw PLC data)
  const { error: insertErr } = await supabase.from('plc_readings').insert({
    session_id: session?.id ?? null,
    machine_code,
    length_m,
    speed_mpm: speed_mpm ?? null,
  })

  if (insertErr) {
    console.error('Insert error:', insertErr)
    return NextResponse.json({ error: 'Insert failed' }, { status: 500 })
  }

  // Auto-complete session if target length reached
  if (session && length_m !== undefined) {
    const { data: sess } = await supabase
      .from('machine_sessions')
      .select('target_length')
      .eq('id', session.id)
      .single()

    if (sess?.target_length && length_m >= sess.target_length) {
      await supabase
        .from('machine_sessions')
        .update({ status: 'completed', ended_at: new Date().toISOString() })
        .eq('id', session.id)
    }
  }

  return NextResponse.json({ ok: true, session_id: session?.id ?? null })
}