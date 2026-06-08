// Called by the QR scan page when a worker scans an order QR code.
// Body: { job_order_no }   (this is what's encoded in the QR code)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { job_order_no } = await req.json()

  if (!job_order_no) {
    return NextResponse.json({ error: 'job_order_no required' }, { status: 422 })
  }

  // Look up order details
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, job_order_no, so_number, item_name, machine_code, length_m')
    .eq('job_order_no', job_order_no)
    .maybeSingle()

  if (orderErr || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  // End any existing active session on the same machine
  if (order.machine_code) {
    await supabase
      .from('machine_sessions')
      .update({ status: 'aborted', ended_at: new Date().toISOString() })
      .eq('machine_code', order.machine_code)
      .eq('status', 'active')
  }

  // Create the new session
  const { data: session, error: sessErr } = await supabase
    .from('machine_sessions')
    .insert({
      order_id:      order.id,
      job_order_no:  order.job_order_no,
      so_number:     order.so_number,
      item_name:     order.item_name,
      machine_code:  order.machine_code,
      target_length: order.length_m,
    })
    .select()
    .single()

  if (sessErr) {
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, session })
}


// app/api/session/end/route.ts
// Body: { session_id, status?: 'completed' | 'aborted' }
export async function PUT(req: NextRequest) {
  const { session_id, status = 'completed' } = await req.json()

  const { error } = await supabase
    .from('machine_sessions')
    .update({ status, ended_at: new Date().toISOString() })
    .eq('id', session_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}